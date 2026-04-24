import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { MealPeriod } from '@/lib/schemas';
import { laDate, currentMealPeriod } from '@/lib/time';

export const dynamic = 'force-dynamic';

const VISIBILITY_THRESHOLD = 1;

type MenuRow = {
  id: string;
  name: string;
  category: string | null;
  dietary_tags: string[];
  avg_stars: string | null;
  rating_count: string;
  thumbnail: string | null;
};

export async function GET(req: Request) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const url = new URL(req.url);
  const hall = url.searchParams.get('hall');
  if (!hall) {
    return NextResponse.json({ error: 'hall required' }, { status: 400 });
  }
  const date = url.searchParams.get('date') ?? laDate();
  const periodRaw = url.searchParams.get('period') ?? currentMealPeriod();
  const period = MealPeriod.safeParse(periodRaw);
  if (!period.success) {
    return NextResponse.json({ error: 'invalid period' }, { status: 400 });
  }

  const { rows } = await query<MenuRow>(
    `SELECT mi.id,
            mi.name,
            mi.category,
            mi.dietary_tags,
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
      WHERE mi.hall_id = $1
        AND mi.date = $2
        AND mi.meal_period = $3::meal_period
      ORDER BY mi.category NULLS LAST, mi.name`,
    [hall, date, period.data],
  );

  const items = rows.map((r) => {
    const count = Number(r.rating_count);
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      tags: r.dietary_tags,
      avg_stars:
        count >= VISIBILITY_THRESHOLD && r.avg_stars !== null
          ? Number(r.avg_stars)
          : null,
      rating_count: count,
      thumbnail: r.thumbnail ?? null,
    };
  });

  return NextResponse.json({ hall_id: hall, date, period: period.data, items });
}
