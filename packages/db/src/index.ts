// Base SQLite dans le processus de l'API (bun:sqlite) : une seule connexion, pas de
// réseau. Les requêtes sont synchrones ; une transaction Drizzle aussi : son corps ne
// doit contenir aucun `await` (sinon la transaction se termine au premier `await`).

import { Database as SQLite } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export * as schema from './schema';
export type * from './schema';

export type { Database } from './types';

/** Dossier des migrations (surchargé dans l'image Docker, où le binaire est compilé). */
export const MIGRATIONS_FOLDER = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Réglages de connexion :
 * - WAL : les lectures ne bloquent pas l'écriture, et Litestream réplique le journal ;
 * - synchronous = NORMAL : en WAL, pas de fsync à chaque transaction (seulement aux
 *   points de contrôle). Un arrêt brutal de l'API ne perd rien ; une coupure de courant
 *   peut perdre les dernières transactions, jamais corrompre la base ;
 * - foreign_keys : désactivées par défaut dans SQLite, indispensables aux cascades ;
 * - busy_timeout : attente si Litestream tient un verrou pendant un point de contrôle.
 */
const PRAGMAS = [
  'journal_mode = WAL',
  'synchronous = NORMAL',
  'foreign_keys = ON',
  'busy_timeout = 5000',
  'temp_store = MEMORY',
  'cache_size = -32000', // 32 Mo
  'mmap_size = 268435456', // 256 Mo
];

/** Ouvre la base (`:memory:` pour les tests) et applique les migrations. */
export function createDatabase(path: string) {
  const sqlite = new SQLite(path, { create: true, strict: true });
  for (const p of PRAGMAS) sqlite.run(`PRAGMA ${p}`);
  const db = drizzle({ client: sqlite, schema, casing: 'snake_case' });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    sqlite,
    close() {
      // Statistiques du planificateur mises à jour à la fermeture (recommandation SQLite).
      sqlite.run('PRAGMA optimize');
      // `true` : fermeture immédiate, requêtes préparées comprises (sinon le fichier reste
      // ouvert jusqu'au ramasse-miettes, après les migrations de Drizzle).
      sqlite.close(true);
    },
  };
}

// Opérateurs Drizzle ré-exportés : une seule copie de drizzle-orm dans le monorepo.
export { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, max, notExists, or, sql } from 'drizzle-orm';
