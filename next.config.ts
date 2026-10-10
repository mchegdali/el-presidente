import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pas de fichier AGENTS.md généré par `next dev`.
  agentRules: false,
};

export default nextConfig;
