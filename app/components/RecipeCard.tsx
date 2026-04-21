'use client';

import type { Hall, Recipe } from '@/lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function mealLabel(m: string) {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export default function RecipeCard({
  recipe,
  hall,
  onClick,
}: {
  recipe: Recipe;
  hall?: Hall;
  onClick: () => void;
}) {
  const isAI = recipe.source === 'ai';
  return (
    <div className="recipe-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="recipe-card-img">
        {recipe.title}
        <br />
        <span style={{ opacity: 0.5, fontSize: '0.6rem' }}>[recipe photo]</span>
        {isAI && <span className="recipe-ai-badge">✦ AI</span>}
      </div>
      <div className="recipe-card-body">
        <div className="recipe-card-hall">
          {(hall?.short_name ?? '…')} · {mealLabel(recipe.meal_period)}
        </div>
        <div className="recipe-card-title">{recipe.title}</div>
        <div className="recipe-card-ingredients">
          <strong>Uses:</strong> {recipe.ingredients.join(', ')}
        </div>
        <div className="recipe-card-footer">
          <span className="recipe-author">{formatShortDate(recipe.date)}</span>
          {isAI && (
            <span className="recipe-author">
              by <strong>@AI</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
