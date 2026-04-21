import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { GenerateRecipeBody } from '@/lib/schemas';
import { generateRecipe } from '@/lib/gemini';
import { laDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

function isAdmin(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers.get('x-admin-secret') === secret;
}

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'recipe generation unavailable' },
      { status: 503 },
    );
  }
  if (!isAdmin(req) && !rateLimit(req, 'generate')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = GenerateRecipeBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { hall_id, meal_period, filters } = parsed.data;
  const save = new URL(req.url).searchParams.get('save') === 'true';
  const date = laDate();

  const hallRes = await query<{ name: string }>(
    `SELECT name FROM halls WHERE id = $1`,
    [hall_id],
  );
  if (hallRes.rows.length === 0) {
    return NextResponse.json({ error: 'hall not found' }, { status: 400 });
  }
  const hallName = hallRes.rows[0].name;

  const itemsRes = await query<{ name: string }>(
    `SELECT name FROM menu_items
      WHERE hall_id = $1 AND date = $2 AND meal_period = $3::meal_period
      ORDER BY name`,
    [hall_id, date, meal_period],
  );
  if (itemsRes.rows.length === 0) {
    return NextResponse.json(
      { error: 'no menu items found for this hall today' },
      { status: 400 },
    );
  }

  let recipe;
  try {
    recipe = await generateRecipe({
      hallName,
      mealPeriod: meal_period,
      items: itemsRes.rows.map((r) => r.name),
      filters,
    });
  } catch (err) {
    console.error('recipe generation failed:', err);
    return NextResponse.json(
      { error: 'generation failed' },
      { status: 500 },
    );
  }

  let savedId: string | null = null;
  if (save) {
    try {
      const ins = await query<{ id: string }>(
        `INSERT INTO recipes (hall_id, source, title, description, ingredients,
                              steps, dietary_tags, prep_time_mins, meal_period,
                              date, status)
         VALUES ($1, 'ai', $2, $3, $4, $5, $6, $7, $8::meal_period, $9, 'published')
         RETURNING id`,
        [
          hall_id,
          recipe.title,
          recipe.description,
          recipe.ingredients,
          recipe.steps,
          recipe.dietary_tags,
          recipe.prep_time_mins,
          meal_period,
          date,
        ],
      );
      savedId = ins.rows[0]?.id ?? null;
    } catch (err) {
      console.error('recipe save failed:', err);
      return NextResponse.json(
        { error: 'failed to save recipe' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    id: savedId,
    hall_id,
    source: 'ai',
    meal_period,
    date,
    ...recipe,
  });
}
