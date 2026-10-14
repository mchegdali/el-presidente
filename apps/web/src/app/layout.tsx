import '@fontsource/rye/latin-400.css';
import '@fontsource/alfa-slab-one/latin-400.css';
import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import CardDefs from '@/components/PlayingCard/CardDefs';
import { API_URL } from '@/lib/config';
import { Providers } from '@/lib/query-client';

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Poignée de main TLS avec l'API engagée avant le premier appel. */}
        <link rel="preconnect" href={API_URL} crossOrigin="use-credentials" />
      </head>
      <body>
        <CardDefs />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
