# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DHeli is a USC dining hall companion web app: daily scraped menus, anonymous 1-5 star dish ratings, and community + AI-generated recipe collection. Four Docker services: Next.js app, PostgreSQL, Supabase Realtime, and a Python scraper.

## Commands

### Development (Docker)

```bash
docker compose up --build            # Start all services (db, app, realtime, scraper)
docker compose down -v               # Tear down everything including database volumes
```

The scraper runs automatically at midnight LA time daily (via `scheduler.py`). It also runs once on startup. To trigger a manual one-off scrape:

```bash
docker compose run --rm scraper python scrape.py
```

### App (inside container or local)

```bash
cd app
npm run dev       # Next.js dev server (port 3000)
npm run build     # Production build
npm run lint      # ESLint via next lint
```

### Database Reset

Migrations in `supabase/migrations/` auto-apply on first `docker compose up`. To reset: `docker compose down -v` then `docker compose up --build`.

## Architecture

```
Browser ──HTTP/WS──▶ Next.js 14 (App Router) ──raw SQL (pg)──▶ PostgreSQL 15
                           │                                         │
                           │ Gemini 2.5 Flash                        │ logical replication
                           ▼                                         ▼
                     Google AI API                          Supabase Realtime ──WS──▶ Browser

Python Scraper (Playwright) ──INSERT──▶ PostgreSQL
                            ──POST──▶ /api/recipes/generate
```

### Key Directories

- `app/app/` — Next.js App Router pages and API route handlers
- `app/lib/` — Shared utilities: db pool, session, rate limiting, Zod schemas, Gemini client, types
- `app/components/` — React components (mix of client and server)
- `scraper/` — Python 3.12 Playwright scraper (`scrape.py`) with daily scheduler (`scheduler.py`)
- `supabase/migrations/` — SQL schema (mounted into Postgres on init)

### API Routes

- `GET /api/halls` — list dining halls
- `GET /api/menus?hall={uuid}&date={YYYY-MM-DD}&period={meal_period}` — menu items with ratings
- `POST /api/ratings` — submit/update a 1-5 star rating (session-based, no auth)
- `GET /api/recipes`, `POST /api/recipes` — list/submit recipes
- `POST /api/recipes/generate` — AI recipe generation via Gemini (`?save=true` persists)
- `POST /api/recipes/[id]/flag` — flag recipe (auto-flags at 3 reports)
- `POST /api/admin/scrape` — dev-only manual menu insertion

### Data Layer

- **No ORM** — raw SQL via `pg.Pool` singleton with parameterized queries (`$1`, `$2`)
- **Session management** — anonymous httpOnly cookie (`dheli_session`), HMAC-SHA256 hashed before DB storage
- **Rate limiting** — in-memory sliding window (Map-based), three tiers: general (60/min), ratings (10/min), generate (5/min)
- **Rating visibility** — `avg_stars` hidden until item has 5+ ratings
- **Meal period enum** — `'breakfast' | 'lunch' | 'dinner'`, auto-detected from LA timezone

### Realtime

Supabase Realtime uses PostgreSQL logical replication (`wal_level=logical`) to broadcast DB changes via WebSocket. The browser-side Supabase client (`lib/supabase.ts`) subscribes; the `pg` pool handles all server-side DB access.

### Scraper Flow

Playwright headless Chromium navigates USC Dining site, extracts menu items from DOM, upserts to DB (`ON CONFLICT DO NOTHING`), then triggers `/api/recipes/generate?save=true` for each hall/period.

## Environment Variables

Copy `.env.example` to `.env`. Key vars: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SECRET`, `GEMINI_API_KEY`, `REALTIME_SECRET_KEY_BASE`, `REALTIME_JWT_SECRET`. Generate secrets with `openssl rand -hex 32`. See `ARCHITECTURE.md` in the parent directory for full reference.
