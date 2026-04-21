'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Hall } from '@/lib/types';

export default function Nav({ halls }: { halls: Hall[] }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });

  const items: { key: string; href: string; label: string }[] = [
    ...halls.map((h) => ({
      key: `hall:${h.short_name.toLowerCase()}`,
      href: `/halls/${h.short_name.toLowerCase()}`,
      label: h.short_name,
    })),
    { key: 'recipes', href: '/recipes', label: 'Recipes' },
  ];

  const activeKey =
    items.find((it) => pathname === it.href || pathname.startsWith(it.href + '/'))
      ?.key ?? null;

  useEffect(() => {
    const update = () => {
      const el = activeKey ? itemsRef.current[activeKey] : null;
      const container = containerRef.current;
      if (!el || !container) {
        setIndicator((i) => ({ ...i, visible: false }));
        return;
      }
      const eRect = el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      setIndicator({
        left: eRect.left - cRect.left,
        width: eRect.width,
        visible: true,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [activeKey]);

  if (pathname === '/') return null;

  return (
    <nav className="dheli-nav">
      <Link href="/" className="nav-logo">
        <span>DHeli</span>
      </Link>
      <div className="nav-links" ref={containerRef}>
        <div
          className="nav-indicator"
          style={{
            width: indicator.width,
            transform: `translateX(${indicator.left}px)`,
            opacity: indicator.visible ? 1 : 0,
          }}
        />
        {items.map((it) => (
          <Link
            key={it.key}
            ref={(el) => {
              itemsRef.current[it.key] = el;
            }}
            href={it.href}
            className={`nav-link ${activeKey === it.key ? 'active' : ''}`}
          >
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
