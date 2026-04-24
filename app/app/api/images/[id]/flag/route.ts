import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getOrCreateSessionHash } from '@/lib/session';

export const dynamic = 'force-dynamic';

const AUTO_FLAG_THRESHOLD = 3;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const imageId = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(imageId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const session = getOrCreateSessionHash();
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM menu_item_image_flags WHERE menu_item_image_id = $1 AND session_token = $2`,
    [imageId, session],
  );
  return NextResponse.json({ flagged: rows.length > 0 });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const imageId = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(imageId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const session = getOrCreateSessionHash();

  // Check if already flagged
  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM menu_item_image_flags WHERE menu_item_image_id = $1 AND session_token = $2`,
    [imageId, session],
  );

  if (existing.length > 0) {
    // Unflag
    await query(
      `DELETE FROM menu_item_image_flags WHERE menu_item_image_id = $1 AND session_token = $2`,
      [imageId, session],
    );
    return NextResponse.json({ ok: true, flagged: false, removed: false });
  }

  // Flag
  await query(
    `INSERT INTO menu_item_image_flags (menu_item_image_id, session_token)
     VALUES ($1, $2)
     ON CONFLICT (menu_item_image_id, session_token) DO NOTHING`,
    [imageId, session],
  );

  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM menu_item_image_flags WHERE menu_item_image_id = $1`,
    [imageId],
  );
  const count = Number(rows[0]?.count ?? 0);

  let removed = false;
  if (count >= AUTO_FLAG_THRESHOLD) {
    await query(`DELETE FROM menu_item_images WHERE id = $1`, [imageId]);
    removed = true;
  }

  return NextResponse.json({ ok: true, flagged: true, flag_count: count, removed });
}
