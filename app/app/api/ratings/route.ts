import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getOrCreateSessionHash } from '@/lib/session';
import { RatingBody } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const VISIBILITY_THRESHOLD = 5;

export async function GET(req: Request) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('menu_item_id');
  if (!id) {
    return NextResponse.json({ error: 'menu_item_id required' }, { status: 400 });
  }
  const { rows } = await query<{ avg: string | null; count: string }>(
    `SELECT ROUND(AVG(stars)::numeric, 2) AS avg,
            COUNT(*)::text AS count
       FROM ratings WHERE menu_item_id = $1`,
    [id],
  );
  const row = rows[0];
  const count = Number(row?.count ?? 0);
  return NextResponse.json({
    avg_stars:
      count >= VISIBILITY_THRESHOLD && row?.avg ? Number(row.avg) : null,
    rating_count: count,
  });
}

export async function POST(req: Request) {
  if (!rateLimit(req, 'ratings')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = RatingBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const session = getOrCreateSessionHash();
  await query(
    `INSERT INTO ratings (menu_item_id, stars, session_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (menu_item_id, session_token)
       DO UPDATE SET stars = EXCLUDED.stars, created_at = now()`,
    [parsed.data.menu_item_id, parsed.data.stars, session],
  );
  return NextResponse.json({ ok: true });
}
