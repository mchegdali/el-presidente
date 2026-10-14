import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export * as schema from './schema';
export type * from './schema';

/** Base Drizzle, quel que soit le pilote (postgres.js en production, PGlite en test). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Dossier des migrations (surchargé dans l'image Docker, où le binaire est compilé). */
export const MIGRATIONS_FOLDER = process.env.MIGRATIONS_DIR ?? new URL('../drizzle', import.meta.url).pathname;

export interface DatabaseOptions {
  /**
   * Connexions simultanées. Sur 2 vCPU partagés, plus de connexions = plus de
   * changements de contexte, pas plus de débit.
   */
  max?: number;
}

/**
 * URL Postgres → options postgres.js. Une socket Unix s'écrit comme pour libpq :
 * `postgres://app@localhost/presidente?host=/var/run/postgresql` ; postgres.js attend
 * alors le chemin complet du fichier de socket dans `path`.
 */
export function connectionOptions(url: string): { url: string; path?: string } {
  const parsed = new URL(url);
  const host = parsed.searchParams.get('host');
  if (host === null || !host.startsWith('/')) return { url };
  parsed.searchParams.delete('host');
  const port = parsed.port || '5432';
  return { url: parsed.toString(), path: `${host.replace(/\/$/, '')}/.s.PGSQL.${port}` };
}

/**
 * Connexion de production : socket Unix ou TCP selon l'URL. Requêtes préparées actives :
 * pas de pooler en mode transaction devant Postgres.
 */
export function createDatabase(url: string, options: DatabaseOptions = {}) {
  const conn = connectionOptions(url);
  const client = postgres(conn.url, {
    ...(conn.path === undefined ? {} : { path: conn.path }),
    max: options.max ?? 2,
    prepare: true,
    idle_timeout: 0,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Database;
  return { db, close: () => client.end({ timeout: 5 }) };
}

/** Applique les migrations (au déploiement, avant le démarrage de l'API). */
export async function runMigrations(url: string): Promise<void> {
  const conn = connectionOptions(url);
  const client = postgres(conn.url, {
    max: 1,
    onnotice: () => {},
    ...(conn.path === undefined ? {} : { path: conn.path }),
  });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Opérateurs Drizzle ré-exportés : une seule copie de drizzle-orm dans le monorepo.
export { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, max, or, sql } from 'drizzle-orm';
