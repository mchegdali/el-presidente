import { createDatabase } from '@el-presidente/db';
import { startServer } from './server';
import { loadEnv } from './shared/env';
import { log } from './shared/logger';

const env = loadEnv();
// Les migrations sont appliquées à l'ouverture, avant d'accepter la moindre requête.
const { db, close } = createDatabase(env.DATABASE_PATH);
const running = await startServer({ env, db });

// Arrêt propre : on écrit les manches en attente avant de fermer la base.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    log.info('arrêt', { signal });
    await running.stop();
    close();
    process.exit(0);
  });
}
