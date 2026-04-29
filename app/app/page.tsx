import Link from 'next/link';
import LandingDate from '@/components/LandingDate';

const HALLS = [
  { short_name: 'Parkside', slug: 'parkside' },
  { short_name: 'EVK', slug: 'evk' },
  { short_name: 'Village', slug: 'village' },
];

export default function LandingPage() {
  return (
    <div className="landing page">
      <div className="landing-bg-text">DHELI</div>
      <div className="landing-trojan-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/trojan-new.png" alt="USC Trojan" />
      </div>
      <div className="landing-title">DHeli</div>
      <div className="landing-sub">USC Dining — Today&apos;s menu at USC, reimagined</div>
      <LandingDate />
      <div className="landing-divider" />
      <div className="landing-halls">
        {HALLS.map((h) => (
          <Link
            key={h.slug}
            className="landing-hall-btn"
            href={`/halls/${h.slug}`}
          >
            {h.short_name}
          </Link>
        ))}
      </div>
    </div>
  );
}
