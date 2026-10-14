/** URL publique de l'API (Hetzner). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_WS_URL = API_URL.replace(/^http/, 'ws');
