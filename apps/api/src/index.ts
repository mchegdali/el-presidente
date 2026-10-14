import { createDatabase } from '@el-presidente/db';
import { startServer } from './server';
import { loadEnv } from './shared/env';
import { log } from './shared/logger';

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
