'use client';

import { useMemo, useState } from 'react';
import RecipeCard from './RecipeCard';
import RecipeModal from './RecipeModal';
import PostRecipeModal, { PostRecipeInput } from './PostRecipeModal';
import type { Hall, MealPeriod, Recipe } from '@/lib/types';
import { mealPeriodsForDate } from '@/lib/time';

type Filter = 'all' | 'community' | 'ai' | string;

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function RecipesClient({
  halls,
  initialRecipes,
}: {
  halls: Hall[];
  initialRecipes: Recipe[];
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [filter, setFilter] = useState<Filter>('all');
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const [showPost, setShowPost] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hallById = useMemo(() => {
    const m = new Map<string, Hall>();
    for (const h of halls) m.set(h.id, h);
    return m;
  }, [halls]);

  const filtered = useMemo(() => {
    if (filter === 'all') return recipes;
    if (filter === 'ai') return recipes.filter((r) => r.source === 'ai');
    if (filter === 'community') return recipes.filter((r) => r.source === 'user');
    return recipes.filter((r) => {
      const h = hallById.get(r.hall_id);
      return h && h.short_name.toLowerCase() === filter;
    });
  }, [recipes, filter, hallById]);

  const handleSurprise = async () => {
    if (halls.length === 0) return;
    setAiLoading(true);
    setError(null);
    const hall = randomChoice(halls);
    const meal = randomChoice(
      (hall.active_meal_periods.length > 0
        ? hall.active_meal_periods
        : mealPeriodsForDate()),
    );
    try {
      const r = await fetch('/api/recipes/generate?save=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hall_id: hall.id, meal_period: meal }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? 'Generation failed');
        return;
      }
      const fresh = await fetch('/api/recipes', { cache: 'no-store' });
      if (fresh.ok) {
        const body = (await fresh.json()) as { recipes: Recipe[] };
        setRecipes(body.recipes);
        const created = body.recipes.find((x) => x.id === data.id);
        if (created) setModalRecipe(created);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const handlePost = async (input: PostRecipeInput) => {
    const r = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      setError('Could not post recipe');
      return;
    }
    const fresh = await fetch('/api/recipes', { cache: 'no-store' });
    if (fresh.ok) {
      const body = (await fresh.json()) as { recipes: Recipe[] };
      setRecipes(body.recipes);
    }
  };

  const handleFlag = async (recipe: Recipe) => {
    const r = await fetch(`/api/recipes/${recipe.id}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await r.json();
    if (data.auto_flagged) {
      setRecipes((prev) => prev.filter((x) => x.id !== recipe.id));
      setModalRecipe(null);
    }
  };

  const hallFilters = halls.map((h) => ({
    key: h.short_name.toLowerCase(),
    label: h.short_name,
  }));

  return (
    <div className="page">
      {modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          hall={hallById.get(modalRecipe.hall_id)}
          onClose={() => setModalRecipe(null)}
          onFlag={() => handleFlag(modalRecipe)}
        />
      )}
      {showPost && (
        <PostRecipeModal
          halls={halls}
          onClose={() => setShowPost(false)}
          onSubmit={handlePost}
        />
      )}

      <div className="recipes-page">
        <div className="recipes-header">
          <div>
            <h1>Recipe Collection</h1>
            <p>Community creations from USC dining halls</p>
          </div>
          <div className="recipes-actions">
            <button
              className={`btn btn-ai ${aiLoading ? 'loading' : ''}`}
              onClick={handleSurprise}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <>
                  <span className="ai-dots">
                    <span />
                    <span />
                    <span />
                  </span>{' '}
                  Generating…
                </>
              ) : (
                <>✦ Surprise Me</>
              )}
            </button>
            <button className="btn btn-primary" onClick={() => setShowPost(true)}>
              + Post Recipe
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              color: 'var(--red)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        <div className="recipes-filters">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'community', label: 'Community' },
              { key: 'ai', label: 'AI Generated' },
              ...hallFilters,
            ] as { key: Filter; label: string }[]
          ).map((f) => (
            <div
              key={f.key}
              className={`filter-pill ${f.key === 'ai' ? 'ai-pill' : ''} ${
                filter === f.key ? 'active' : ''
              }`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--faint)',
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: '1rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            No recipes for this filter yet.
          </div>
        ) : (
          <div className="recipes-grid">
            {filtered.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                hall={hallById.get(r.hall_id)}
                onClick={() => setModalRecipe(r)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
