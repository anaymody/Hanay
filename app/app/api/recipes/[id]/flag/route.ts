import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { getOrCreateSessionHash } from '@/lib/session';
import { FlagBody } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const AUTO_FLAG_THRESHOLD = 3;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!rateLimit(req, 'general')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const recipeId = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(recipeId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const session = getOrCreateSessionHash();
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM recipe_flags WHERE recipe_id = $1 AND session_token = $2`,
    [recipeId, session],
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
  const recipeId = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(recipeId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = FlagBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const session = getOrCreateSessionHash();

  // Check if already flagged
  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM recipe_flags WHERE recipe_id = $1 AND session_token = $2`,
    [recipeId, session],
  );

  if (existing.length > 0) {
    // Unflag
    await query(
      `DELETE FROM recipe_flags WHERE recipe_id = $1 AND session_token = $2`,
      [recipeId, session],
    );
    return NextResponse.json({ ok: true, flagged: false, auto_flagged: false });
  }

  // Flag
  await query(
    `INSERT INTO recipe_flags (recipe_id, session_token, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (recipe_id, session_token) DO NOTHING`,
    [recipeId, session, parsed.data.reason ?? null],
  );

  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM recipe_flags WHERE recipe_id = $1`,
    [recipeId],
  );
  const count = Number(rows[0]?.count ?? 0);

  let autoFlagged = false;
  if (count >= AUTO_FLAG_THRESHOLD) {
    await query(
      `UPDATE recipes SET status = 'flagged'
        WHERE id = $1 AND status = 'published'`,
      [recipeId],
    );
    autoFlagged = true;
  }
  return NextResponse.json({ ok: true, flagged: true, flag_count: count, auto_flagged: autoFlagged });
}
