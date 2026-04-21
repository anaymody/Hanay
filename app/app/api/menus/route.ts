import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { MealPeriod } from '@/lib/schemas';
import { laDate, currentMealPeriod } from '@/lib/time';

export const dynamic = 'force-dynamic';

const VISIBILITY_THRESHOLD = 5;

type MenuRow = {
  id: string;
  name: string;
  category: string | null;
  dietary_tags: string[];
  avg_stars: string | null;
  rating_count: string;
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
            ROUND(AVG(r.stars)::numeric, 2) AS avg_stars,
            COUNT(r.id)::text AS rating_count
       FROM menu_items mi
       LEFT JOIN ratings r ON r.menu_item_id = mi.id
      WHERE mi.hall_id = $1
        AND mi.date = $2
        AND mi.meal_period = $3::meal_period
      GROUP BY mi.id
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
    };
  });

  return NextResponse.json({ hall_id: hall, date, period: period.data, items });
}
