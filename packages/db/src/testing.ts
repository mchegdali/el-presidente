// Base Postgres en mémoire (PGlite) avec les vraies migrations, pour les tests.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER, type Database } from './index';
import * as schema from './schema';

export async function createTestDatabase() {
  const client = new PGlite();
  const raw = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(raw, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: raw as unknown as Database, client, close: () => client.close() };
}
