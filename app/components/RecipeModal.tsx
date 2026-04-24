'use client';

import { useRef, useState } from 'react';
import type { Hall, Recipe, RecipeImage } from '@/lib/types';
import { formatShortDate } from './RecipeCard';
import { getSupabase } from '@/lib/supabase';

function mealLabel(m: string) {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function getPublicUrl(path: string) {
  const supabase = getSupabase();
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}

export default function RecipeModal({
  recipe,
  hall,
  onClose,
  onFlag,
  images,
  onUpload,
  onImageRemoved,
  initialRecipeFlagged = false,
  initialFlaggedImageIds = [],
}: {
  recipe: Recipe;
  hall?: Hall;
  onClose: () => void;
  onFlag?: (flagged: boolean) => void;
  images?: RecipeImage[];
  onUpload?: (file: File) => Promise<void>;
  onImageRemoved?: (imageId: string) => void;
  initialRecipeFlagged?: boolean;
  initialFlaggedImageIds?: string[];
}) {
  const isAI = recipe.source === 'ai';
  const [imgIdx, setImgIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recipeFlagged, setRecipeFlagged] = useState(initialRecipeFlagged);
  const [flaggedImages, setFlaggedImages] = useState<Set<string>>(new Set(initialFlaggedImageIds));
  const inputRef = useRef<HTMLInputElement>(null);

  const hasImages = images && images.length > 0;
  const currentImg = hasImages ? images[imgIdx] : null;

  async function handleImageFlag() {
    if (!currentImg) return;
    const wasFlagged = flaggedImages.has(currentImg.id);
    setFlaggedImages((prev) => {
      const next = new Set(prev);
      if (wasFlagged) next.delete(currentImg.id);
      else next.add(currentImg.id);
      return next;
    });
    try {
      const r = await fetch(`/api/recipe-images/${currentImg.id}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json();
      if (data.removed) {
        onImageRemoved?.(currentImg.id);
        if (images && images.length <= 1) {
          setImgIdx(0);
        } else if (imgIdx >= (images?.length ?? 1) - 1) {
          setImgIdx(Math.max(0, imgIdx - 1));
        }
      }
    } catch {}
  }

  async function handleRecipeFlag() {
    const newState = !recipeFlagged;
    setRecipeFlagged(newState);
    onFlag?.(newState);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onUpload(file);
      setImgIdx(0);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

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

          {/* Photos section — beneath the last instruction */}
          <div className="modal-section-label" style={{ marginTop: '1.25rem' }}>
            Photos
          </div>
          {hasImages && (
            <div className="recipe-modal-photos">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPublicUrl(currentImg!.storage_path)}
                alt={recipe.title}
              />
              <button
                className={`image-flag-btn${flaggedImages.has(currentImg!.id) ? ' flagged' : ''}`}
                onClick={handleImageFlag}
                aria-label="Flag image"
              >
                ⚑
              </button>
              {images.length > 1 && (
                <>
                  <button
                    className="image-modal-arrow left"
                    onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                    aria-label="Previous"
                  >
                    &#8249;
                  </button>
                  <button
                    className="image-modal-arrow right"
                    onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                    aria-label="Next"
                  >
                    &#8250;
                  </button>
                </>
              )}
              {images.length > 1 && (
                <div className="image-modal-dots">
                  {images.map((_, i) => (
                    <span
                      key={i}
                      className={`image-modal-dot${i === imgIdx ? ' active' : ''}`}
                      onClick={() => setImgIdx(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {onUpload && (
            <>
              <button
                className="recipe-modal-upload-btn"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : '+ Upload Photo'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
              {uploadError && (
                <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '0.4rem', textAlign: 'center' }}>
                  {uploadError}
                </div>
              )}
            </>
          )}

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
                  className={`btn btn-ghost${recipeFlagged ? ' btn-flagged' : ''}`}
                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.65rem' }}
                  onClick={handleRecipeFlag}
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
