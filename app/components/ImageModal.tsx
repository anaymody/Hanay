'use client';

import { useRef, useState } from 'react';
import type { MenuItem, MenuItemImage } from '@/lib/types';
import { getSupabase } from '@/lib/supabase';

export default function ImageModal({
  item,
  images,
  onClose,
  onUpload,
}: {
  item: MenuItem;
  images: MenuItemImage[];
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [idx, setIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasImages = images.length > 0;
  const current = hasImages ? images[idx] : null;

  function prev() {
    setIdx((i) => (i - 1 + images.length) % images.length);
  }
  function next() {
    setIdx((i) => (i + 1) % images.length);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(file);
      setIdx(0); // navigate to newest (images are newest-first)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function getPublicUrl(path: string) {
    const supabase = getSupabase();
    return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="image-modal" onClick={(e) => e.stopPropagation()}>
        {hasImages ? (
          <div className="image-modal-viewport">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="image-modal-img"
              src={getPublicUrl(current!.storage_path)}
              alt={item.name}
            />

            {images.length > 1 && (
              <>
                <button className="image-modal-arrow left" onClick={prev} aria-label="Previous">
                  &#8249;
                </button>
                <button className="image-modal-arrow right" onClick={next} aria-label="Next">
                  &#8250;
                </button>
              </>
            )}

            <div className="image-modal-dots">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`image-modal-dot${i === idx ? ' active' : ''}`}
                  onClick={() => setIdx(i)}
                />
              ))}
            </div>

            <button
              className="image-modal-upload"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : '+ Upload Photo'}
            </button>
            {error && <div className="image-modal-error">{error}</div>}
          </div>
        ) : (
          <div className="image-modal-empty">
            <div className="image-modal-empty-text">Be the first to add a photo</div>
            <button
              className="image-modal-upload"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              style={{ position: 'static', transform: 'none' }}
            >
              {uploading ? 'Uploading...' : '+ Upload Photo'}
            </button>
            {error && <div className="image-modal-error">{error}</div>}
          </div>
        )}

        <button className="image-modal-close" onClick={onClose} aria-label="Close">
          &#10005;
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
