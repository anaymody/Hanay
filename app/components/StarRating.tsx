'use client';

import { useState } from 'react';

export default function StarRating({
  rating,
  count,
  onRate,
  size = 'sm',
}: {
  rating: number | null | undefined;
  count?: number;
  onRate?: (n: number) => void;
  size?: 'sm' | 'lg';
}) {
  const [hover, setHover] = useState(0);
  const display = hover || rating || 0;
  return (
    <div className="star-rating" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${display >= n ? 'filled' : ''}`}
          style={{ fontSize: size === 'lg' ? '1.1rem' : '0.9rem' }}
          onMouseEnter={() => onRate && setHover(n)}
          onMouseLeave={() => onRate && setHover(0)}
          onClick={() => onRate?.(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
        >
          ★
        </button>
      ))}
      {count !== undefined && <span className="star-count">({count})</span>}
    </div>
  );
}
