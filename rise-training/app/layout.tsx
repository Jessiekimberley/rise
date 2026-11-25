import type { Metadata, Viewport } from 'next';
import { Inter_Tight, Newsreader } from 'next/font/google';
import './styles.css';

const inter = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter-tight' });
const newsreader = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], axes: ['opsz'], variable: '--font-newsreader' });

export const metadata: Metadata = {
  title: 'Rise Training', description: 'Your programme, training log and coach check-ins.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Rise Training' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#C9D6E8', viewportFit: 'cover' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-NZ" className={`${inter.variable} ${newsreader.variable}`}><body>{children}</body></html>;
}
