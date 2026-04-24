import 'server-only';
import { query } from './db';
import type { Hall, MealPeriod, MenuItem, Recipe } from './types';

const HALL_META: Record<string, Omit<Hall, 'id'>> = {
  parkside: {
    name: 'Parkside Restaurant',
    short_name: 'Parkside',
    location: 'Parkside Complex',
    active_meal_periods: ['breakfast', 'lunch', 'dinner', 'brunch'],
    hours: {
      weekday: { breakfast: '7:00–11:00 AM', lunch: '11:00 AM–4:00 PM', dinner: '4:00–10:00 PM' },
      weekend: { brunch: '8:30 AM–4:00 PM', dinner: '4:00–10:00 PM' },
    },
  },
  evk: {
    name: "Everybody's Kitchen",
    short_name: 'EVK',
    location: 'McCarthy Quad',
    active_meal_periods: ['breakfast', 'lunch', 'dinner', 'brunch'],
    hours: {
      weekday: { breakfast: '7:00–11:00 AM', lunch: '11:00 AM–4:00 PM', dinner: '4:00–10:00 PM' },
      weekend: { brunch: '8:30 AM–4:00 PM', dinner: '4:00–10:00 PM' },
    },
  },
  village: {
    name: 'USC Village Dining Hall',
    short_name: 'Village',
    location: 'USC Village',
    active_meal_periods: ['breakfast', 'lunch', 'dinner', 'brunch'],
    hours: {
      weekday: { breakfast: '7:00–11:00 AM', lunch: '11:00 AM–4:00 PM', dinner: '4:00–10:00 PM' },
      weekend: { brunch: '8:30 AM–4:00 PM', dinner: '4:00–10:00 PM' },
    },
  },
};

export async function getHalls(): Promise<Hall[]> {
  const { rows } = await query<{ id: string; short_name: string }>(
    `SELECT id, short_name FROM halls ORDER BY name`,
  );
  return rows
    .map((r) => {
      const meta = HALL_META[r.short_name.toLowerCase()];
      return meta ? { id: r.id, ...meta } : null;
    })
    .filter((h): h is Hall => h !== null);
}

export async function getHallBySlug(slug: string): Promise<Hall | null> {
  const meta = HALL_META[slug.toLowerCase()];
  if (!meta) return null;
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM halls WHERE LOWER(short_name) = $1`,
    [slug.toLowerCase()],
  );
  if (rows.length === 0) return null;
  return { id: rows[0].id, ...meta };
}

const VISIBILITY_THRESHOLD = 1;

export async function getMenu(
  hallId: string,
  date: string,
  period: MealPeriod,
): Promise<MenuItem[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    category: string | null;
    dietary_tags: string[];
    avg_stars: string | null;
    rating_count: string;
    thumbnail: string | null;
  }>(
    `SELECT mi.id, mi.name, mi.category, mi.dietary_tags,
            rating_agg.avg_stars,
            rating_agg.rating_count::text AS rating_count,
            latest_img.storage_path AS thumbnail
       FROM menu_items mi
       LEFT JOIN LATERAL (
         SELECT ROUND(AVG(r.stars)::numeric, 2) AS avg_stars,
                COUNT(*) AS rating_count
           FROM ratings r
           JOIN menu_items mi2 ON mi2.id = r.menu_item_id
          WHERE mi2.hall_id = mi.hall_id AND mi2.name = mi.name
       ) rating_agg ON true
       LEFT JOIN LATERAL (
         SELECT mii.storage_path
           FROM menu_item_images mii
           JOIN menu_items mi2 ON mi2.id = mii.menu_item_id
          WHERE mi2.hall_id = mi.hall_id AND mi2.name = mi.name
          ORDER BY mii.created_at DESC LIMIT 1
       ) latest_img ON true
      WHERE mi.hall_id = $1 AND mi.date = $2 AND mi.meal_period = $3::meal_period
      ORDER BY mi.category NULLS LAST, mi.name`,
    [hallId, date, period],
  );
  return rows.map((r) => {
    const count = Number(r.rating_count);
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      tags: r.dietary_tags,
      avg_stars:
        count >= VISIBILITY_THRESHOLD && r.avg_stars ? Number(r.avg_stars) : null,
      rating_count: count,
      thumbnail: r.thumbnail ?? null,
    };
  });
}

export async function getRecipes(opts: {
  hallId?: string;
  filter?: 'all' | 'ai' | 'community';
  limit?: number;
} = {}): Promise<Recipe[]> {
  const where: string[] = [`r.status = 'published'`];
  const params: unknown[] = [];
  if (opts.hallId) {
    params.push(opts.hallId);
    where.push(`r.hall_id = $${params.length}`);
  }
  if (opts.filter === 'ai') where.push(`r.source = 'ai'`);
  if (opts.filter === 'community') where.push(`r.source = 'user'`);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  params.push(limit);
  const { rows } = await query<Recipe>(
    `SELECT r.id, r.hall_id, r.source, r.title, r.description, r.ingredients, r.steps,
            r.dietary_tags, r.prep_time_mins, r.meal_period, r.date::text AS date,
            r.created_at::text AS created_at,
            latest_img.storage_path AS thumbnail
       FROM recipes r
       LEFT JOIN LATERAL (
         SELECT storage_path FROM recipe_images
          WHERE recipe_id = r.id ORDER BY created_at DESC LIMIT 1
       ) latest_img ON true
      WHERE ${where.join(' AND ')}
      ORDER BY (r.source = 'ai') DESC, r.created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}
