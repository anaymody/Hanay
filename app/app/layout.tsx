import './globals.css';
import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import Nav from '@/components/Nav';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DHeli — USC Dining',
  description: "Today's menu at USC, reimagined.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>
        <div id="root">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
