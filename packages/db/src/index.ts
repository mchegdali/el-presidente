import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export * as schema from './schema';
export type * from './schema';

/** Base Drizzle, quel que soit le pilote (postgres.js en production, PGlite en test). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = new URL('../drizzle', import.meta.url).pathname;

export interface DatabaseOptions {
  /**
   * Connexions simultanées. Sur 2 vCPU partagés, plus de connexions = plus de
   * changements de contexte, pas plus de débit.
   */
  max?: number;
}

/**
 * Connexion de production : socket Unix ou TCP selon l'URL
 * (`postgres://app@/presidente?host=/var/run/postgresql`). Requêtes préparées actives :
 * pas de pooler en mode transaction devant Postgres.
 */
export function createDatabase(url: string, options: DatabaseOptions = {}) {
  const client = postgres(url, {
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
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}
