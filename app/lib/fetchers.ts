import 'server-only';
import { query } from './db';
import type { Hall, MealPeriod, MenuItem, Recipe } from './types';

export async function getHalls(): Promise<Hall[]> {
  const { rows } = await query<Hall>(
    `SELECT id, name, short_name, location, hours,
            active_meal_periods::text[] AS active_meal_periods
       FROM halls
       ORDER BY name`,
  );
  return rows;
}

export async function getHallBySlug(slug: string): Promise<Hall | null> {
  const target = slug.toLowerCase();
  const all = await getHalls();
  return all.find((h) => h.short_name.toLowerCase() === target) ?? null;
}

const VISIBILITY_THRESHOLD = 5;

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
  }>(
    `SELECT mi.id, mi.name, mi.category, mi.dietary_tags,
            ROUND(AVG(r.stars)::numeric, 2) AS avg_stars,
            COUNT(r.id)::text AS rating_count
       FROM menu_items mi
       LEFT JOIN ratings r ON r.menu_item_id = mi.id
      WHERE mi.hall_id = $1 AND mi.date = $2 AND mi.meal_period = $3::meal_period
      GROUP BY mi.id
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
    };
  });
}

export async function getRecipes(opts: {
  hallId?: string;
  filter?: 'all' | 'ai' | 'community';
  limit?: number;
} = {}): Promise<Recipe[]> {
  const where: string[] = [`status = 'published'`];
  const params: unknown[] = [];
  if (opts.hallId) {
    params.push(opts.hallId);
    where.push(`hall_id = $${params.length}`);
  }
  if (opts.filter === 'ai') where.push(`source = 'ai'`);
  if (opts.filter === 'community') where.push(`source = 'user'`);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  params.push(limit);
  const { rows } = await query<Recipe>(
    `SELECT id, hall_id, source, title, description, ingredients, steps,
            dietary_tags, prep_time_mins, meal_period, date::text AS date,
            created_at::text AS created_at
       FROM recipes
      WHERE ${where.join(' AND ')}
      ORDER BY (source = 'ai') DESC, created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}
