'use client';

import { useState } from 'react';

function starClass(
  n: number,
  hover: number,
  avgRating: number,
  userRating: number | null,
): string {
  if (hover > 0) {
    return n <= hover ? 'star filled-user' : 'star';
  }

  if (userRating !== null) {
    if (userRating === avgRating) {
      return n <= userRating ? 'star filled-user' : 'star';
    }
    if (userRating < avgRating) {
      if (n <= userRating) return 'star filled-user';
      if (n <= avgRating) return 'star filled-avg';
      return 'star';
    }
    // userRating > avgRating
    if (n <= avgRating) return 'star filled-avg';
    if (n <= userRating) return 'star filled-user';
    return 'star';
  }

  return n <= avgRating ? 'star filled-avg' : 'star';
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
