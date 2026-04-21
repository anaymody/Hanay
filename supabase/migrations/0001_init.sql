-- DHeli initial schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE meal_period   AS ENUM ('breakfast', 'lunch', 'dinner');
CREATE TYPE recipe_source AS ENUM ('ai', 'user');
CREATE TYPE recipe_status AS ENUM ('published', 'flagged', 'hidden');

-- Halls
CREATE TABLE halls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  short_name          text NOT NULL,
  location            text NOT NULL,
  active_meal_periods meal_period[] NOT NULL DEFAULT '{}',
  venue_id            text NOT NULL,
  hours               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Menu items
CREATE TABLE menu_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id      uuid NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  date         date NOT NULL,
  meal_period  meal_period NOT NULL,
  name         text NOT NULL,
  category     text,
  dietary_tags text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hall_id, date, meal_period, name)
);

-- Ratings
CREATE TABLE ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  stars         smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  session_token varchar(128) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, session_token)
);

-- Rating history (archival)
CREATE TABLE rating_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  avg_stars     numeric(3,2),
  rating_count  integer,
  archived_at   date NOT NULL,
  UNIQUE (menu_item_id, archived_at)
);

-- Recipes
CREATE TABLE recipes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id        uuid NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  source         recipe_source NOT NULL,
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  ingredients    text[] NOT NULL DEFAULT '{}',
  steps          text[] NOT NULL DEFAULT '{}',
  dietary_tags   text[] NOT NULL DEFAULT '{}',
  prep_time_mins integer CHECK (prep_time_mins IS NULL OR prep_time_mins > 0),
  meal_period    meal_period NOT NULL,
  date           date NOT NULL,
  status         recipe_status NOT NULL DEFAULT 'published',
  menu_item_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Recipe flags
CREATE TABLE recipe_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id     uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  session_token varchar(128) NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, session_token)
);

-- Indexes
CREATE INDEX idx_menu_items_hall_date_period ON menu_items(hall_id, date, meal_period);
CREATE INDEX idx_ratings_menu_item           ON ratings(menu_item_id);
CREATE INDEX idx_recipes_hall_date_period    ON recipes(hall_id, date, meal_period);
CREATE INDEX idx_recipe_flags_recipe         ON recipe_flags(recipe_id);
CREATE INDEX idx_rating_history_menu_item    ON rating_history(menu_item_id);

-- Replication: make ratings/menu_items broadcast full rows so Realtime subscribers
-- get useful payloads when filtering by menu_item_id.
ALTER TABLE menu_items REPLICA IDENTITY FULL;
ALTER TABLE ratings    REPLICA IDENTITY FULL;
ALTER TABLE recipes    REPLICA IDENTITY FULL;

-- Seed halls
INSERT INTO halls (name, short_name, location, active_meal_periods, venue_id, hours) VALUES
  (
    'Parkside Restaurant',
    'Parkside',
    'Parkside Complex',
    ARRAY['breakfast','lunch','dinner']::meal_period[],
    'parkside',
    '{"breakfast":"7:30–10:00 AM","lunch":"11:00 AM–2:30 PM","dinner":"5:00–9:30 PM"}'::jsonb
  ),
  (
    'Everybody''s Kitchen',
    'EVK',
    'McCarthy Quad',
    ARRAY['breakfast','lunch','dinner']::meal_period[],
    'evk',
    '{"breakfast":"7:00–10:30 AM","lunch":"11:00 AM–3:00 PM","dinner":"4:30–9:00 PM"}'::jsonb
  ),
  (
    'USC Village Dining Hall',
    'Village',
    'USC Village',
    ARRAY['breakfast','lunch','dinner']::meal_period[],
    'university-village',
    '{"breakfast":"7:00–10:00 AM","lunch":"11:30 AM–3:30 PM","dinner":"4:00–10:00 PM"}'::jsonb
  );
