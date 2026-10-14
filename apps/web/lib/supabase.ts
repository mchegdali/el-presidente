import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TableState } from './types';

let client: SupabaseClient | null = null;

export function supabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY doivent être définies.');
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export class GameError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

/** Appelle une fonction RPC du jeu ; toutes renvoient l'état de la table. */
export async function call<T = TableState>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) {
    const offline = !error.code && /fetch|network/i.test(error.message);
    throw new GameError(offline ? 'Connexion impossible. Vérifiez votre réseau.' : error.message, error.hint ?? undefined);
  }
  return data as T;
}

/**
 * Appel RPC qui survit à la fermeture de la page (fetch keepalive), sans réponse.
 * Sert à signaler que le joueur quitte l'onglet.
 */
export function rpcBeacon(fn: string, args: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }).catch(() => {});
}
