import Link from 'next/link';
import { getHalls } from '@/lib/fetchers';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  let halls: Awaited<ReturnType<typeof getHalls>> = [];
  try {
    halls = await getHalls();
  } catch {
    halls = [];
  }

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="landing page">
      <div className="landing-bg-text">DHELI</div>
      <div className="landing-trojan-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/trojan-new.png" alt="USC Trojan" />
      </div>
      <div className="landing-title">DHeli</div>
      <div className="landing-sub">USC Dining — Today&apos;s menu at USC, reimagined</div>
      <div className="landing-date">{today}</div>
      <div className="landing-divider" />
      <div className="landing-halls">
        {halls.map((h) => (
          <Link
            key={h.id}
            className="landing-hall-btn"
            href={`/halls/${h.short_name.toLowerCase()}`}
          >
            {h.short_name}
          </Link>
        ))}
      </div>
    </div>
  );
}
