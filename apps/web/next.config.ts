import type { NextConfig } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws');

// CSP : Next injecte des scripts en ligne (données RSC) dans des pages statiques, d'où
// 'unsafe-inline' pour les scripts ; tout le reste est verrouillé (connexions limitées à
// l'API, pas d'iframe, pas d'objet, formulaires vers soi ou l'API seulement).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://lh3.googleusercontent.com",
  "font-src 'self'",
  `connect-src 'self' ${API} ${WS}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${API}`,
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  // Pages statiques servies du cache ; les données vivantes arrivent par le client.
  cacheComponents: true,
  partialPrefetching: true,
  // Pas de fichier AGENTS.md généré par `next dev`.
  agentRules: false,
  transpilePackages: ['@el-presidente/game'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ];
  },
};

export default nextConfig;
