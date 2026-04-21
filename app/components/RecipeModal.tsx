'use client';

import type { Hall, Recipe } from '@/lib/types';
import { formatShortDate } from './RecipeCard';

function mealLabel(m: string) {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export default function RecipeModal({
  recipe,
  hall,
  onClose,
  onFlag,
}: {
  recipe: Recipe;
  hall?: Hall;
  onClose: () => void;
  onFlag?: () => void;
}) {
  const isAI = recipe.source === 'ai';
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div
              style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--red)',
                marginBottom: '0.3rem',
              }}
            >
              {(hall?.short_name ?? '…')} · {mealLabel(recipe.meal_period)}
              {isAI && (
                <span
                  style={{
                    marginLeft: '0.5rem',
                    background: '#1a1714',
                    color: '#fff',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 3,
                    fontSize: '0.58rem',
                  }}
                >
                  ✦ AI
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: '1.5rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                lineHeight: 1.1,
              }}
            >
              {recipe.title}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {recipe.description && (
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '0.875rem',
                marginBottom: '1rem',
                lineHeight: 1.55,
              }}
            >
              {recipe.description}
            </p>
          )}
          <div className="modal-section-label">Ingredients from the hall</div>
          <div className="modal-ingredients">
            {recipe.ingredients.map((i) => (
              <span key={i} className="modal-ingredient">
                {i}
              </span>
            ))}
          </div>
          <div className="modal-section-label" style={{ marginTop: '1.25rem' }}>
            Steps
          </div>
          <ol className="modal-steps">
            {recipe.steps.map((s, i) => (
              <li key={i} className="modal-step">
                <span className="modal-step-num">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--faint)',
              }}
            >
              {isAI ? '@AI · ' : ''}
              {formatShortDate(recipe.date)}
            </span>
            <div
              style={{
                display: 'flex',
                gap: '0.3rem',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {recipe.dietary_tags.map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily: "'Barlow Condensed',sans-serif",
                    fontSize: '0.58rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '0.18rem 0.45rem',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    color: 'var(--muted)',
                  }}
                >
                  {t}
                </span>
              ))}
              {onFlag && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.65rem' }}
                  onClick={onFlag}
                >
                  Flag
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
