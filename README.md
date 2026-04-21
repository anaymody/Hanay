# DHeli

USC dining hall companion. Daily scraped menus, 1–5 star dish ratings, and a
community/AI recipe collection.

## Stack

- Next.js 14 (App Router, TypeScript)
- PostgreSQL 15 (raw SQL via `pg`)
- Python 3.12 scraper (Playwright + Chromium)
- Supabase Realtime (WebSocket broadcast over Postgres logical replication)
- Gemini 2.5 Flash for AI recipe generation

Everything orchestrated via `docker-compose.yml`.

## Quick start

```bash
cp .env.example .env
# Fill in:
#   POSTGRES_PASSWORD          (any strong password; also update DATABASE_URL)
#   SESSION_SECRET             openssl rand -hex 32
#   ADMIN_SECRET               openssl rand -hex 32
#   REALTIME_SECRET_KEY_BASE   openssl rand -hex 32 (must be 64+ chars)
#   REALTIME_JWT_SECRET        openssl rand -hex 32
#   GEMINI_API_KEY             from https://aistudio.google.com/apikey

docker compose up --build          # db + app + realtime
docker compose run --rm scraper    # one-off: pull today's menus + kick AI recipes
```

App is then at <http://localhost:3000>.

## Layout

```
app/           # Next.js (API routes + SSR pages)
supabase/      # SQL migrations (auto-applied on first `docker compose up`)
scraper/      # Python/Playwright daily scraper (runs via `profiles: [scraper]`)
```

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for the full backend design reference.
