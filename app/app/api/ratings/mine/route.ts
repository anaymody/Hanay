import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getOrCreateSessionHash } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const url = new URL(req.url);
  const ids = url.searchParams.get('items');
  if (!ids) {
    return NextResponse.json({ error: 'items required' }, { status: 400 });
  }

  const itemIds = ids.split(',').filter(Boolean);
  if (itemIds.length === 0) {
    return NextResponse.json({ ratings: {} });
  }

  const session = getOrCreateSessionHash();
  const placeholders = itemIds.map((_, i) => `$${i + 2}`).join(',');
  const { rows } = await query<{ menu_item_id: string; stars: number }>(
    `SELECT menu_item_id, stars FROM ratings
      WHERE session_token = $1 AND menu_item_id IN (${placeholders})`,
    [session, ...itemIds],
  );

  const ratings: Record<string, number> = {};
  for (const r of rows) {
    ratings[r.menu_item_id] = r.stars;
  }
  return NextResponse.json({ ratings });
}
