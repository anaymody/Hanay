'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import DishCard from './DishCard';
import RecipeCard from './RecipeCard';
import RecipeModal from './RecipeModal';
import type { Hall, MealPeriod, MenuItem, Recipe } from '@/lib/types';
import { isWeekend, mealPeriodsForDate, isHallOpen } from '@/lib/time';

const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

async function fetchMenu(hallId: string, period: MealPeriod): Promise<MenuItem[]> {
  const r = await fetch(`/api/menus?hall=${hallId}&period=${period}`, {
    cache: 'no-store',
  });
  if (!r.ok) return [];
  const data = (await r.json()) as { items: MenuItem[] };
  return data.items;
}

export default function HallClient({
  hall,
  initialPeriod,
  initialItems,
  initialRecipes,
}: {
  hall: Hall;
  initialPeriod: MealPeriod;
  initialItems: MenuItem[];
  initialRecipes: Recipe[];
}) {
  const [period, setPeriod] = useState<MealPeriod>(initialPeriod);
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (period === initialPeriod) {
      setItems(initialItems);
      return;
    }
    let cancelled = false;
    fetchMenu(hall.id, period).then((next) => {
      if (!cancelled) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [period, hall.id, initialPeriod, initialItems]);

  const categories = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    for (const item of items) {
      const cat = item.category ?? 'Menu';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [items]);

  const hallRecipes = initialRecipes.filter((r) => r.hall_id === hall.id).slice(0, 3);

  const isOpen = isHallOpen(hall);

  const handleRate = (itemId: string, stars: number) => {
    setUserRatings((prev) => ({ ...prev, [itemId]: stars }));
    startTransition(() => {
      void fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu_item_id: itemId, stars }),
      });
    });
  };

  return (
    <div className="page">
      <div className="hall-hero" data-bg={hall.short_name}>
        <div className="hall-hero-inner">
          <div className="hall-hero-bar" />
          <div className="hall-hero-main">
            <div className="hall-hero-eyebrow">
              <span>Dining Hall</span>
              <span className={`hall-status-chip ${!isOpen ? 'closed' : ''}`}>
                {isOpen ? 'Open Now' : 'Closed Now'}
              </span>
            </div>
            <div className="hall-hero-name">{hall.name}</div>
            <div className="hall-hero-meta">
              <span>{TODAY_LABEL}</span>
              <span className="dot">·</span>
              <span>{hall.location}</span>
            </div>
            <div className="hall-hero-hours">
              {mealPeriodsForDate()
                .filter((m) => {
                  const hrs = hall.hours[isWeekend() ? 'weekend' : 'weekday'];
                  return hrs?.[m];
                })
                .map((m) => {
                  const hrs = hall.hours[isWeekend() ? 'weekend' : 'weekday'];
                  return (
                    <div key={m} className={`slot ${m === period ? 'current' : ''}`}>
                      <span className="slot-label">{m}</span>
                      <span className="slot-value">{hrs?.[m]}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      <div className="hall-body">
        <div className="meal-tabs">
          {mealPeriodsForDate().map((m) => (
            <button
              key={m}
              className={`meal-tab ${period === m ? 'active' : ''}`}
              onClick={() => setPeriod(m)}
              type="button"
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {Object.keys(categories).length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No menu yet for this meal today — check back soon.
          </p>
        ) : (
          Object.entries(categories).map(([cat, list]) => (
            <div key={cat} className="menu-section">
              <div className="menu-section-title">{cat}</div>
              <div className="menu-grid">
                {list.map((item) => (
                  <DishCard
                    key={item.id}
                    item={item}
                    userRating={userRatings[item.id] ?? null}
                    onRate={(n) => handleRate(item.id, n)}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <div className="hall-recipes-header">
          <div className="section-title">Recipes from {hall.short_name}</div>
          <Link href="/recipes" className="see-all-btn">
            See all →
          </Link>
        </div>
        <div className="recipes-grid">
          {hallRecipes.length === 0 ? (
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '0.875rem',
                gridColumn: '1/-1',
              }}
            >
              No recipes yet for this hall.
            </p>
          ) : (
            hallRecipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} hall={hall} onClick={() => setModalRecipe(r)} />
            ))
          )}
        </div>
      </div>

      {modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          hall={hall}
          onClose={() => setModalRecipe(null)}
        />
      )}
    </div>
  );
}
