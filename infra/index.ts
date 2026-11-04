// Production d'El Presidente : un serveur Hetzner (Caddy, API, Litestream), une Storage
// Box pour la réplique de la base, DNS chez OVH, site sur Vercel.
//
//   pulumi preview --stack prod
//   pulumi up --stack prod          (normalement : par la CI, voir .github/workflows/deploy.yml)

import './src/app';
import './src/dns';
import './src/vercel';
import { apiDomain, webDomain } from './src/config';
import { hostKey, ipv4, ipv6 } from './src/server';

export const api = `https://${apiDomain}`;
export const web = `https://${webDomain}`;
export const serverIpv4 = ipv4;
export const serverIpv6 = ipv6;
/** À comparer à l'empreinte affichée par `ssh admin@<ip>` à la première connexion. */
export const serverHostKey = hostKey.publicKeyOpenssh;
