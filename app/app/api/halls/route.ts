import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

type HallRow = {
  id: string;
  name: string;
  short_name: string;
  location: string;
  hours: {
    weekday: Record<string, string>;
    weekend: Record<string, string>;
  };
  active_meal_periods: string[];
};

export async function GET(req: Request) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { rows } = await query<HallRow>(
    `SELECT id, name, short_name, location, hours,
            active_meal_periods::text[] AS active_meal_periods
       FROM halls
       ORDER BY name`,
  );
  return NextResponse.json({ halls: rows });
}
