'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import DishCard from './DishCard';
import RecipeCard from './RecipeCard';
import RecipeModal from './RecipeModal';
import ImageModal from './ImageModal';
import type { Hall, MealPeriod, MenuItem, MenuItemImage, Recipe, RecipeImage } from '@/lib/types';
import { isWeekend, mealPeriodsForDate, isHallOpen } from '@/lib/time';
import { getSupabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageUtils';

function tagLabel(tag: string): string {
  switch (tag) {
    case 'halal-ingredients': return 'Halal';
    case 'gluten-free': return 'GF';
    default: return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
}

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
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [modalImages, setModalImages] = useState<MenuItemImage[]>([]);
  const [modalRecipeImages, setModalRecipeImages] = useState<RecipeImage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setActiveTags(new Set());
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

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const ids = items.map((i) => i.id).join(',');
    fetch(`/api/ratings/mine?items=${ids}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.ratings) {
          setUserRatings((prev) => ({ ...prev, ...data.ratings }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [items]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of items) {
      for (const t of item.tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeTags.size === 0) return items;
    return items.filter((item) =>
      Array.from(activeTags).every((tag) => item.tags.includes(tag))
    );
  }, [items, activeTags]);

  const categories = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    for (const item of filteredItems) {
      const cat = item.category ?? 'Menu';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [filteredItems]);

  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const hallRecipes = recipes.filter((r) => r.hall_id === hall.id).slice(0, 3);

  const isOpen = isHallOpen(hall);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

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

  const handleDishClick = async (item: MenuItem) => {
    setModalItem(item);
    try {
      const r = await fetch(`/api/images?menu_item_id=${item.id}`, { cache: 'no-store' });
      if (r.ok) setModalImages(await r.json());
      else setModalImages([]);
    } catch {
      setModalImages([]);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!modalItem) return;
    const compressed = await compressImage(file);
    const path = `${modalItem.id}/${crypto.randomUUID()}.webp`;
    const supabase = getSupabase();
    const { error: storageError } = await supabase.storage.from('menu-images').upload(path, compressed, {
      contentType: 'image/webp',
    });
    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);
    const res = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_item_id: modalItem.id, storage_path: path }),
    });
    if (!res.ok) throw new Error('Failed to save image metadata');
    // Refresh images
    const r = await fetch(`/api/images?menu_item_id=${modalItem.id}`, { cache: 'no-store' });
    if (r.ok) setModalImages(await r.json());
  };

  const handleRecipeFlag = async (recipe: Recipe) => {
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

  const handleRecipeClick = async (recipe: Recipe) => {
    setModalRecipe(recipe);
    try {
      const r = await fetch(`/api/recipe-images?recipe_id=${recipe.id}`, { cache: 'no-store' });
      if (r.ok) setModalRecipeImages(await r.json());
      else setModalRecipeImages([]);
    } catch {
      setModalRecipeImages([]);
    }
  };

  const handleRecipeImageUpload = async (file: File) => {
    if (!modalRecipe) return;
    const compressed = await compressImage(file);
    const path = `recipes/${modalRecipe.id}/${crypto.randomUUID()}.webp`;
    const supabase = getSupabase();
    const { error: storageError } = await supabase.storage.from('menu-images').upload(path, compressed, {
      contentType: 'image/webp',
    });
    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);
    const res = await fetch('/api/recipe-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: modalRecipe.id, storage_path: path }),
    });
    if (!res.ok) throw new Error('Failed to save image metadata');
    const r = await fetch(`/api/recipe-images?recipe_id=${modalRecipe.id}`, { cache: 'no-store' });
    if (r.ok) setModalRecipeImages(await r.json());
  };

  const handleGenerate = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const r = await fetch('/api/recipes/generate?save=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hall_id: hall.id, meal_period: period }),
      });
      const data = await r.json();
      if (!r.ok) {
        setAiError(data?.error ?? 'Generation failed');
        return;
      }
      const fresh = await fetch(`/api/recipes?hall=${hall.id}`, { cache: 'no-store' });
      if (fresh.ok) {
        const body = (await fresh.json()) as { recipes: Recipe[] };
        setRecipes(body.recipes);
        const created = body.recipes.find((x) => x.id === data.id);
        if (created) {
          setModalRecipe(created);
          setModalRecipeImages([]);
        }
      }
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
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

        {availableTags.length > 0 && (
          <div className="menu-filters">
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`filter-pill ${activeTags.has(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tagLabel(tag)}
              </button>
            ))}
          </div>
        )}

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
                    onClick={() => handleDishClick(item)}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <div className="hall-recipes-header">
          <div className="section-title">Recipes from {hall.short_name}</div>
          <div style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
            <button
              className={`btn btn-ai ${aiLoading ? 'loading' : ''}`}
              onClick={handleGenerate}
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
                <>✦ Generate Recipe</>
              )}
            </button>
            <Link href="/recipes" className="see-all-btn">
              See all →
            </Link>
          </div>
        </div>
        {aiError && (
          <div
            style={{
              color: 'var(--red)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            {aiError}
          </div>
        )}
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
              <RecipeCard key={r.id} recipe={r} hall={hall} onClick={() => handleRecipeClick(r)} />
            ))
          )}
        </div>
      </div>

      {modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          hall={hall}
          onClose={() => { setModalRecipe(null); setModalRecipeImages([]); }}
          onFlag={() => handleRecipeFlag(modalRecipe)}
          images={modalRecipeImages}
          onUpload={handleRecipeImageUpload}
          onImageRemoved={(id) => setModalRecipeImages((prev) => prev.filter((img) => img.id !== id))}
        />
      )}

      {modalItem && (
        <ImageModal
          item={modalItem}
          images={modalImages}
          onClose={() => { setModalItem(null); setModalImages([]); }}
          onUpload={handleImageUpload}
        />
      )}
    </div>
  );
}
