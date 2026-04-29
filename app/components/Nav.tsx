'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const HALL_TABS = [
  { key: 'hall:parkside', href: '/halls/parkside', label: 'Parkside' },
  { key: 'hall:evk', href: '/halls/evk', label: 'EVK' },
  { key: 'hall:village', href: '/halls/village', label: 'Village' },
];

export default function Nav() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });

  const items = [...HALL_TABS, { key: 'recipes', href: '/recipes', label: 'Recipes' }];

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

  return (
    <nav className="dheli-nav" style={pathname === '/' ? { display: 'none' } : undefined}>
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
