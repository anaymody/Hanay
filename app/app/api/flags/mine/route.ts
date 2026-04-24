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
  const recipeId = url.searchParams.get('recipe_id');
  const recipeImageIds = url.searchParams.get('recipe_image_ids')?.split(',').filter(Boolean) ?? [];
  const menuItemImageIds = url.searchParams.get('menu_item_image_ids')?.split(',').filter(Boolean) ?? [];

  const session = getOrCreateSessionHash();

  const results: {
    recipe_flagged: boolean;
    flagged_recipe_image_ids: string[];
    flagged_menu_item_image_ids: string[];
  } = {
    recipe_flagged: false,
    flagged_recipe_image_ids: [],
    flagged_menu_item_image_ids: [],
  };

  const promises: Promise<void>[] = [];

  if (recipeId) {
    promises.push(
      query<{ id: string }>(
        `SELECT id FROM recipe_flags WHERE recipe_id = $1 AND session_token = $2`,
        [recipeId, session],
      ).then(({ rows }) => {
        results.recipe_flagged = rows.length > 0;
      }),
    );
  }

  if (recipeImageIds.length > 0) {
    const placeholders = recipeImageIds.map((_, i) => `$${i + 2}`).join(',');
    promises.push(
      query<{ recipe_image_id: string }>(
        `SELECT recipe_image_id FROM recipe_image_flags
          WHERE session_token = $1 AND recipe_image_id IN (${placeholders})`,
        [session, ...recipeImageIds],
      ).then(({ rows }) => {
        results.flagged_recipe_image_ids = rows.map((r) => r.recipe_image_id);
      }),
    );
  }

  if (menuItemImageIds.length > 0) {
    const placeholders = menuItemImageIds.map((_, i) => `$${i + 2}`).join(',');
    promises.push(
      query<{ menu_item_image_id: string }>(
        `SELECT menu_item_image_id FROM menu_item_image_flags
          WHERE session_token = $1 AND menu_item_image_id IN (${placeholders})`,
        [session, ...menuItemImageIds],
      ).then(({ rows }) => {
        results.flagged_menu_item_image_ids = rows.map((r) => r.menu_item_image_id);
      }),
    );
  }

  await Promise.all(promises);

  return NextResponse.json(results);
}
