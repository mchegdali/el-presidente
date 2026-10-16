// Base de test avec les vraies migrations :
// - par défaut, Postgres en mémoire (PGlite) ;
// - si TEST_DATABASE_URL est définie, une base jetable sur un vrai serveur Postgres
//   (même pilote qu'en production), supprimée à la fermeture.
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import postgres from 'postgres';
import { connectionOptions, createDatabase, MIGRATIONS_FOLDER, runMigrations, type Database } from './index';
import * as schema from './schema';

export interface TestDatabase {
  db: Database;
  /** Requête SQL brute (vérifications de catalogue). */
  query<T>(text: string): Promise<T[]>;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const server = process.env.TEST_DATABASE_URL;
  if (server !== undefined && server !== '') return createServerDatabase(server);
  const client = new PGlite();
  const raw = drizzlePglite(client, { schema, casing: 'snake_case' });
  await migratePglite(raw, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db: raw as unknown as Database,
    query: async <T>(text: string) => (await client.query<T>(text)).rows,
    close: () => client.close(),
  };
}

async function createServerDatabase(serverUrl: string): Promise<TestDatabase> {
  const name = `test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = connectionOptions(serverUrl);
  const sqlAdmin = postgres(admin.url, { max: 1, onnotice: () => {}, ...(admin.path ? { path: admin.path } : {}) });
  await sqlAdmin.unsafe(`create database ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  const { db, close } = createDatabase(url.toString(), { max: 4 });
  const raw = postgres(connectionOptions(url.toString()).url, {
    max: 1,
    ...(admin.path ? { path: admin.path } : {}),
  });
  return {
    db,
    query: async <T>(text: string) => (await raw.unsafe(text)) as unknown as T[],
    async close() {
      await close();
      await raw.end();
      await sqlAdmin.unsafe(`drop database if exists ${name} with (force)`);
      await sqlAdmin.end();
    },
  };
}
