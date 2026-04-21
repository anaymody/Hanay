import RecipesClient from '@/components/RecipesClient';
import { getHalls, getRecipes } from '@/lib/fetchers';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  let halls: Awaited<ReturnType<typeof getHalls>> = [];
  let recipes: Awaited<ReturnType<typeof getRecipes>> = [];
  try {
    [halls, recipes] = await Promise.all([getHalls(), getRecipes({ limit: 100 })]);
  } catch {
    // leave empty on DB error; UI renders the zero state.
  }
  return <RecipesClient halls={halls} initialRecipes={recipes} />;
}
