# Phase 1: Migrate to Hosted Supabase

## Context

DHeli currently runs PostgreSQL and Supabase Realtime as local Docker containers. Now that we're adopting Supabase Storage for image uploads, it makes sense to migrate the entire database to a hosted Supabase project first. This simplifies the Docker setup (fewer services) and consolidates all data services under one provider.

## Approach

**Keep raw SQL / pg.Pool** — just swap `DATABASE_URL` to Supabase's PostgreSQL connection string. All existing queries stay exactly as-is. This is the minimal-change path.

## Steps

### 1. Create Supabase project

- Create a new project at supabase.com
- Note the project URL, anon key, and PostgreSQL connection string (Settings > Database)
- Create a `menu-images` Storage bucket (public reads, 5MB limit, image MIME types only)

### 2. Run migrations on hosted Supabase

Execute the existing migration SQL files against the hosted Supabase database:
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_add_brunch_weekend.sql`

Can be done via the Supabase SQL Editor in the dashboard.

### 3. Update environment variables

Update `.env` with hosted Supabase credentials:
- `DATABASE_URL` → Supabase PostgreSQL connection string (direct connection, port 5432)
- `NEXT_PUBLIC_SUPABASE_URL` → Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Supabase anon key

Update `.env.example` with placeholder descriptions for the new values.

### 4. Simplify Docker Compose

Remove from `docker-compose.yml`:
- `db` service (PostgreSQL container)
- `realtime` service (Supabase Realtime container)
- `db_data` volume
- `depends_on: db` from `app` and `scraper` services
- All `REALTIME_*` env vars from the app service

Keep:
- `app` service (Next.js) — now connects to hosted Supabase via `DATABASE_URL`
- `scraper` service — now connects to hosted Supabase via `DATABASE_URL`

### 5. Update Supabase client config

File: `app/lib/supabase.ts`

No code changes needed — the client already reads from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Once the env vars point to the hosted project, Realtime and Storage are both available through the same client.

### 6. Clean up

- Remove `REALTIME_SECRET_KEY_BASE` and `REALTIME_JWT_SECRET` from `.env.example`
- Update `CLAUDE.md` architecture section to reflect hosted Supabase
- Remove references to local DB/Realtime containers from documentation

### Files modified

- `.env.example` — updated env var descriptions
- `docker-compose.yml` — remove `db` and `realtime` services
- `CLAUDE.md` — update architecture docs

### Files unchanged (key insight)

- `app/lib/db.ts` — no changes, `pg.Pool` reads `DATABASE_URL` which now points to Supabase
- All API routes — no changes, raw SQL queries work identically against Supabase PostgreSQL
- `scraper/scrape.py` — no changes, `psycopg2.connect(DATABASE_URL)` works with Supabase
- `app/lib/supabase.ts` — no changes, already reads the right env vars

### Verification

1. Run `docker compose up --build` (now only app + scraper)
2. Visit `http://localhost:3000` — verify halls page loads with data
3. Navigate to a dining hall — verify menu items display
4. Rate a dish — verify rating persists
5. Check recipes page — verify recipes load
6. Verify Realtime still works (live rating updates)

---

# Phase 2: Menu Item Image Gallery

## Context

DHeli menu items currently show placeholder text "[food photo]" with no actual images. Users want to see what dishes look like before choosing meals. This feature adds community-uploaded photos to menu items, displayed in a minimal carousel popup when a dish card is clicked.

## Design Decisions

- **Storage**: Supabase Storage — client-side uploads to a public `menu-images` bucket (created in Phase 1)
- **Permissions**: Anonymous uploads tied to session (matching existing rating pattern)
- **Image limit**: Soft limit of 15 images per menu item (enforced at API level)
- **Popup style**: Minimal standalone image with rounded corners, overlay arrows (no shadow), dot indicators, centered upload button near bottom
- **Empty state**: Popup opens with upload prompt ("Be the first to add a photo")
- **Image processing**: Client-side resize (max 1200px wide) and WebP compression via canvas

## Database

### New migration: `0003_menu_item_images.sql`

```sql
CREATE TABLE menu_item_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  session_token text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mii_menu_item ON menu_item_images(menu_item_id);
```

Run this migration via Supabase SQL Editor (same as Phase 1 migrations).

## API Routes

### `POST /api/images` — Upload image metadata

**Request body** (JSON):
```json
{
  "menu_item_id": "uuid",
  "storage_path": "string"
}
```

**Flow**:
1. Get/create session via `getOrCreateSessionHash()`
2. Validate body with Zod schema
3. Verify `menu_item_id` exists in `menu_items` table
4. Check image count — reject if >= 15
5. Rate limit with `general` preset
6. Insert into `menu_item_images`
7. Return `201` with the new record

### `GET /api/images?menu_item_id=<uuid>` — List images

**Flow**:
1. Validate `menu_item_id` query param
2. Query `menu_item_images WHERE menu_item_id = $1 ORDER BY created_at DESC`
3. Return array of `{ id, storage_path, created_at }`

## Frontend Components

### New: `ImageModal.tsx`

Minimal popup matching the approved mockup:
- **Overlay**: Same `modal-overlay` pattern as RecipeModal (click overlay to close)
- **Content**: Single rounded-corner image container (no card chrome, no header/footer)
- **Carousel**: Left/right circular arrow buttons overlaid on image, no shadow. Dot indicators above upload button.
- **Upload button**: Centered near bottom of image, red background (`var(--red)`), uppercase condensed text
- **Close button**: Top-right of image area, simple `✕`
- **Empty state**: Placeholder with "Be the first to add a photo" text and prominent upload button

**Props**:
```typescript
{
  item: MenuItem;
  images: MenuItemImage[];
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}
```

### Modified: `DishCard.tsx`

- Add `onClick` prop
- Make card clickable with `cursor: pointer`
- StarRating already has `e.stopPropagation()` (line 19) — no conflict

### Modified: `HallClient.tsx`

- Add state: `modalItem: MenuItem | null` and `modalImages: MenuItemImage[]`
- On DishCard click: set `modalItem`, fetch images from `/api/images?menu_item_id=<id>`
- Render `ImageModal` when `modalItem` is set
- Handle upload: upload file to Supabase Storage, POST metadata, refresh images

### New: `lib/imageUtils.ts`

Client-side image resize/compress utility:
- Max dimension: 1200px
- Output: WebP at 0.8 quality
- Uses canvas API

### New types/schemas

`lib/types.ts`:
```typescript
export interface MenuItemImage {
  id: string;
  storage_path: string;
  created_at: string;
}
```

`lib/schemas.ts`:
```typescript
export const PostImageBody = z.object({
  menu_item_id: z.string().uuid(),
  storage_path: z.string().min(1).max(500),
});
```

## CSS additions in `globals.css`

- `.image-modal` — rounded image container
- `.image-modal-arrow` — circular arrow buttons, no shadow
- `.image-modal-dots` — dot indicators
- `.image-modal-upload` — centered upload button
- `.image-modal-empty` — empty state
- Responsive mobile styles

## Verification

1. Run migration via Supabase SQL Editor
2. Click a dish card → modal opens with empty state → upload prompt shows
3. Upload an image → appears in carousel and in Supabase Storage
4. Upload 3+ images → arrows navigate, dots update
5. Verify 15-image limit is enforced
6. Click stars on a dish card → rating works without opening modal
