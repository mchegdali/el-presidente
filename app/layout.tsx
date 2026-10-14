import type { Metadata, Viewport } from 'next';
import '@fontsource/rye';
import '@fontsource/alfa-slab-one';
import './globals.css';
import CardDefs from '@/components/CardDefs';

export const metadata: Metadata = {
  title: 'El Presidente — le jeu du Président',
  description: 'Jouez au Président entre amis, en temps réel, depuis vos téléphones. ¡Viva El Presidente!',
  appleWebApp: { capable: true, title: 'El Presidente', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1b1033',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <CardDefs />
        {children}
      </body>
    </html>
  );
}
