'use client';

import { useState } from 'react';
import type { Hall, MealPeriod } from '@/lib/types';
import { currentMealPeriod, mealPeriodsForDate } from '@/lib/time';

export type PostRecipeInput = {
  hall_id: string;
  meal_period: MealPeriod;
  title: string;
  ingredients: string[];
  steps: string[];
};

export default function PostRecipeModal({
  halls,
  onClose,
  onSubmit,
}: {
  halls: Hall[];
  onClose: () => void;
  onSubmit: (input: PostRecipeInput) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    title: '',
    hall_id: halls[0]?.id ?? '',
    meal: currentMealPeriod() as MealPeriod,
    ingredients: '',
    steps: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    const ingredients = form.ingredients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const steps = form.steps
      .split('\n')
      .map((s) => s.replace(/^Step\s*\d+[:.]?\s*/i, '').trim())
      .filter(Boolean);
    if (!title || ingredients.length === 0 || steps.length === 0 || !form.hall_id) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        hall_id: form.hall_id,
        meal_period: form.meal,
        title,
        ingredients,
        steps,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div
            style={{
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: '1.5rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            Share a Recipe
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <form className="post-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Recipe Title</label>
            <input
              className="form-input"
              placeholder="e.g. The Trojan Stack"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Dining Hall</label>
              <select
                className="form-select"
                value={form.hall_id}
                onChange={(e) => set('hall_id', e.target.value)}
              >
                {halls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.short_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Meal</label>
              <select
                className="form-select"
                value={form.meal}
                onChange={(e) => set('meal', e.target.value as MealPeriod)}
              >
                {mealPeriodsForDate().map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Ingredients (comma-separated)</label>
            <input
              className="form-input"
              placeholder="e.g. Mac & Cheese, BBQ Chicken, Broccoli"
              value={form.ingredients}
              onChange={(e) => set('ingredients', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Steps (one per line)</label>
            <textarea
              className="form-textarea"
              placeholder={'Grab a bowl...\nAdd...'}
              value={form.steps}
              onChange={(e) => set('steps', e.target.value)}
              required
            />
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              marginTop: '0.5rem',
            }}
          >
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Posting…' : 'Post Recipe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
