'use client';

import { useState } from 'react';

function starClass(
  n: number,
  hover: number,
  avgRating: number,
  userRating: number | null,
): string {
  if (hover > 0) {
    return n <= hover ? 'star filled-gold' : 'star';
  }

  if (userRating !== null) {
    if (userRating === avgRating) {
      return n <= userRating ? 'star filled-gold' : 'star';
    }
    if (userRating < avgRating) {
      if (n <= userRating) return 'star filled-gold';
      if (n <= avgRating) return 'star filled-cardinal';
      return 'star';
    }
    // userRating > avgRating
    if (n <= avgRating) return 'star filled-cardinal';
    if (n <= userRating) return 'star filled-gold';
    return 'star';
  }

  return n <= avgRating ? 'star filled-cardinal' : 'star';
}

export default function StarRating({
  avgRating,
  userRating,
  count,
  onRate,
  size = 'sm',
}: {
  avgRating: number;
  userRating: number | null;
  count?: number;
  onRate?: (n: number) => void;
  size?: 'sm' | 'lg';
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-rating" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={starClass(n, hover, avgRating, userRating)}
          style={{ fontSize: size === 'lg' ? '1.1rem' : '0.9rem' }}
          onMouseEnter={() => onRate && setHover(n)}
          onMouseLeave={() => onRate && setHover(0)}
          onClick={() => onRate?.(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
        >
          ★
        </button>
      ))}
      {count !== undefined && <span className="star-count">{count}</span>}
    </div>
  );
}
