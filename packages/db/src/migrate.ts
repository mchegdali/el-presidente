// bun run migrate — applique les migrations sur DATABASE_URL.
import { runMigrations } from './index';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquante');
  process.exit(1);
}
await runMigrations(url);
console.log('Migrations appliquées.');
