import type { MetadataRoute } from 'next';

// Permet d'installer le jeu sur l'écran d'accueil (indispensable aux notifications sur iPhone).
// Sans start_url, l'icône rouvre la page depuis laquelle on l'a ajoutée (la table).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'El Presidente',
    short_name: 'Presidente',
    description: 'Le jeu du Président entre amis, en temps réel.',
    display: 'standalone',
    background_color: '#1b1033',
    theme_color: '#1b1033',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
