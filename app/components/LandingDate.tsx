'use client';

export default function LandingDate() {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return <div className="landing-date">{today}</div>;
}
