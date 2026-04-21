import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { MealPeriod } from '@/lib/schemas';
import { laDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

const Item = z.object({
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  dietary_tags: z.array(z.string()).optional().default([]),
});

const Body = z.object({
  hall_id: z.string().uuid(),
  meal_period: MealPeriod,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(Item),
});

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const expected = process.env.ADMIN_SECRET;
  const got = req.headers.get('x-admin-secret');
  if (!expected || got !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { hall_id, meal_period, items } = parsed.data;
  const date = parsed.data.date ?? laDate();

  let inserted = 0;
  for (const item of items) {
    const r = await query(
      `INSERT INTO menu_items (hall_id, date, meal_period, name, category, dietary_tags)
       VALUES ($1, $2, $3::meal_period, $4, $5, $6)
       ON CONFLICT (hall_id, date, meal_period, name) DO NOTHING`,
      [
        hall_id,
        date,
        meal_period,
        item.name,
        item.category ?? null,
        item.dietary_tags ?? [],
      ],
    );
    if ((r.rowCount ?? 0) > 0) inserted++;
  }
  return NextResponse.json({ ok: true, inserted, total: items.length });
}
