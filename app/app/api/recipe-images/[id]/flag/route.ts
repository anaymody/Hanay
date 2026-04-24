import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getOrCreateSessionHash } from '@/lib/session';

export const dynamic = 'force-dynamic';

const AUTO_FLAG_THRESHOLD = 3;

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

  await query(
    `INSERT INTO recipe_image_flags (recipe_image_id, session_token)
     VALUES ($1, $2)
     ON CONFLICT (recipe_image_id, session_token) DO NOTHING`,
    [imageId, session],
  );

  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM recipe_image_flags WHERE recipe_image_id = $1`,
    [imageId],
  );
  const count = Number(rows[0]?.count ?? 0);

  let removed = false;
  if (count >= AUTO_FLAG_THRESHOLD) {
    await query(`DELETE FROM recipe_images WHERE id = $1`, [imageId]);
    removed = true;
  }

  return NextResponse.json({ ok: true, flag_count: count, removed });
}
