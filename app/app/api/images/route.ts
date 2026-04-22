import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getOrCreateSessionHash } from '@/lib/session';
import { PostImageBody } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const MAX_IMAGES_PER_ITEM = 15;

export async function GET(req: Request) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const url = new URL(req.url);
  const menuItemId = url.searchParams.get('menu_item_id');
  if (!menuItemId) {
    return NextResponse.json({ error: 'menu_item_id required' }, { status: 400 });
  }
  const { rows } = await query<{ id: string; storage_path: string; created_at: string }>(
    `SELECT id, storage_path, created_at
       FROM menu_item_images
      WHERE menu_item_id = $1
      ORDER BY created_at DESC`,
    [menuItemId],
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = PostImageBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { menu_item_id, storage_path } = parsed.data;

  // Verify menu item exists
  const { rows: items } = await query('SELECT id FROM menu_items WHERE id = $1', [menu_item_id]);
  if (items.length === 0) {
    return NextResponse.json({ error: 'menu item not found' }, { status: 404 });
  }

  // Check image count limit
  const { rows: countRows } = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM menu_item_images WHERE menu_item_id = $1',
    [menu_item_id],
  );
  if (Number(countRows[0].count) >= MAX_IMAGES_PER_ITEM) {
    return NextResponse.json({ error: 'image limit reached' }, { status: 409 });
  }

  const session = getOrCreateSessionHash();
  const { rows } = await query<{ id: string; storage_path: string; created_at: string }>(
    `INSERT INTO menu_item_images (menu_item_id, storage_path, session_token)
     VALUES ($1, $2, $3)
     RETURNING id, storage_path, created_at`,
    [menu_item_id, storage_path, session],
  );
  return NextResponse.json(rows[0], { status: 201 });
}
