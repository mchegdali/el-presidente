// Type seul, sans code d'exécution : importable par les types générés de l'API que lit le
// site (Next), qui ne connaît pas `bun:sqlite`.
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type * as schema from './schema';

export type Database = BunSQLiteDatabase<typeof schema>;
