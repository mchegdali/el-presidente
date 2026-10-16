// Client HTTP typé de l'API : les types viennent directement des routes Hono (AppType),
// sans génération de code. Le cookie de session part avec chaque requête.

import type { AppType } from '@el-presidente/api';
import { hc } from 'hono/client';
import { API_URL } from './config';

export const api = hc<AppType>(API_URL, { init: { credentials: 'include' } });

export interface ApiError {
  tag: string;
  message: string;
}

/** Corps JSON d'une réponse : la valeur, ou l'erreur typée renvoyée par l'API. */
export async function read<T>(res: Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>) {
  let r: { ok: boolean; status: number; json(): Promise<unknown> };
  try {
    r = await res;
  } catch {
    return { ok: false as const, error: { tag: 'Network', message: 'Connexion impossible. Vérifiez votre réseau.' } };
  }
  const body = (await r.json().catch(() => null)) as { error?: ApiError } | null;
  if (r.ok) return { ok: true as const, value: body as T, status: r.status };
  return {
    ok: false as const,
    error: body?.error ?? { tag: 'Unknown', message: 'Erreur inattendue.' },
    status: r.status,
  };
}
