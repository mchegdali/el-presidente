import { createDatabase, runMigrations } from '@el-presidente/db';
import { startServer } from './server';
import { loadEnv } from './shared/env';
import { log } from './shared/logger';

// `presidente-api migrate` : applique les migrations puis s'arrête (au déploiement, avant
// le redémarrage de l'API). Un seul binaire dans l'image.
if (process.argv[2] === 'migrate') {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL manquante');
    process.exit(1);
  }
  await runMigrations(url);
  console.log('Migrations appliquées.');
  process.exit(0);
}

const env = loadEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 2 });
const running = await startServer({ env, db });

// Arrêt propre : on écrit les manches en attente avant de partir.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    log.info('arrêt', { signal });
    await running.stop();
    await close();
    process.exit(0);
  });
}
