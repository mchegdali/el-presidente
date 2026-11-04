// Base de test : SQLite en mémoire avec les vraies migrations et les mêmes réglages
// qu'en production (même pilote, même code).
import { createDatabase } from './index';

export type TestDatabase = ReturnType<typeof createDatabase>;

export function createTestDatabase(): TestDatabase {
  return createDatabase(':memory:');
}
