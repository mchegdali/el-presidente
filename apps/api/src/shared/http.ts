// Sortie unique des erreurs HTTP : chaque erreur typée devient un statut et un corps
// `{ error: { tag, message } }`. Les statuts étant typés, le client `hc` distingue
// succès et erreurs sans try/catch.

import { matchError, type Result } from 'better-result';
import type { Context } from 'hono';
import type { AppError } from './errors';
import { log } from './logger';

export interface ErrorBody {
  error: { tag: AppError['_tag']; message: string };
}

export function statusOf(error: AppError) {
  return matchError(error, {
    GameRuleError: () => 422 as const,
    Invalid: () => 400 as const,
    Unauthorized: () => 401 as const,
    Forbidden: () => 403 as const,
    NotFound: () => 404 as const,
    Conflict: () => 409 as const,
    RateLimited: () => 429 as const,
    Unavailable: () => 503 as const,
    DbError: () => 503 as const,
  });
}

export function fail(c: Context, error: AppError) {
  if (error._tag === 'DbError') log.error('db', { message: String((error.cause as Error)?.message ?? error.cause) });
  if (error._tag === 'RateLimited' || error._tag === 'Unavailable') c.header('Retry-After', String(error.retryAfter));
  const body: ErrorBody = { error: { tag: error._tag, message: error.message } };
  return c.json(body, statusOf(error));
}

/** Réponse d'un cas d'usage : 200 avec la valeur, ou l'erreur typée. */
export function respond<T>(c: Context, result: Result<T, AppError>) {
  return result.isOk() ? c.json(result.value, 200) : fail(c, result.error);
}
