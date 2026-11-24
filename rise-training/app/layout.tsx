import type { Metadata, Viewport } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Rise Training', description: 'Your programme, training log and coach check-ins.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Rise Training' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f8f5ef', viewportFit: 'cover' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-NZ"><body>{children}</body></html>;
}
