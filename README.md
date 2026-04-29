# DHeli

USC dining hall companion app. Browse daily menus from Parkside, EVK, and Village, rate dishes 1-5 stars, upload food photos, and discover community and AI-generated recipes — all without creating an account.

## Features

- **Daily menus** — Playwright scraper pulls menus from USC Dining at midnight LA time
- **Anonymous ratings** — Rate dishes 1-5 stars with no login required (cookie-based sessions)
- **AI recipes** — Gemini 2.5 Flash generates microwave-friendly recipes from each day's menu items
- **Community recipes** — Submit and share your own creations
- **Image uploads** — Upload photos of dishes and recipes via Supabase Storage
- **Realtime updates** — Menu changes and new ratings pushed instantly via WebSocket

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Backend | Next.js API routes, raw SQL via `pg` (no ORM) |
| Database | PostgreSQL 15 on Supabase |
| Realtime | Supabase Realtime (Postgres logical replication) |
| Storage | Supabase Storage (image uploads) |
| AI | Google Gemini 2.5 Flash (`@google/genai`) |
| Scraper | Python 3.12, Playwright, Chromium |
| Validation | Zod 4 |
| Infra | Docker Compose (local), Kubernetes on GCP (prod) |

## Quick start

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (URI) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ADMIN_SECRET` | `openssl rand -hex 32` |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |

Then run:

```bash
docker compose up --build          # start app + scraper
```

App is at **http://localhost:3000**. The scraper runs automatically on startup and daily at midnight LA time.

To trigger a manual scrape:

```bash
docker compose run --rm scraper python scrape.py
```

## Project layout

```
app/                    # Next.js application
  app/                  # App Router pages & API routes
  components/           # React components (DishCard, StarRating, RecipeModal, etc.)
  lib/                  # Shared utils (db pool, session, rate limiting, Gemini client, Zod schemas)
scraper/                # Python Playwright scraper + daily scheduler
supabase/migrations/    # SQL schema migrations (run via Supabase SQL Editor)
k8s/                    # Kubernetes manifests for GCP production deployment
docker-compose.yml      # Local development orchestration
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/halls` | List dining halls |
| `GET` | `/api/menus?hall=&date=&period=` | Menu items with aggregated ratings |
| `POST` | `/api/ratings` | Submit or update a dish rating |
| `GET` | `/api/recipes` | List recipes |
| `POST` | `/api/recipes` | Submit a user recipe |
| `POST` | `/api/recipes/generate` | Generate AI recipe (`?save=true` to persist) |
| `POST` | `/api/images` | Upload image metadata |

## Architecture

```
Browser ──HTTP/WS──▶ Next.js (App Router) ──raw SQL──▶ Supabase PostgreSQL
                           │                                    │
                           │ Gemini 2.5 Flash                   │ logical replication
                           ▼                                    ▼
                     Google AI API                     Supabase Realtime ──WS──▶ Browser

Python Scraper (Playwright) ──INSERT──▶ Supabase PostgreSQL
                            ──POST──▶ /api/recipes/generate
```

Key design choices:
- **No ORM** — raw parameterized SQL for full control and lightweight footprint
- **Anonymous sessions** — httpOnly cookie, HMAC-SHA256 hashed before storage
- **In-memory rate limiting** — sliding window, 60 req/min general, 5 req/min for AI generation
- **Realtime via Supabase** — `REPLICA IDENTITY FULL` on key tables for complete row payloads over WebSocket
