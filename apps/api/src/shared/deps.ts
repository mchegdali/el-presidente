import type { Database } from '@el-presidente/db';
import type { Rng } from '@el-presidente/game';
import type { GameWriter } from '../features/tables/shared/game-writer';
import type { TableStore } from '../features/tables/shared/store';
import type { PushSender } from '../features/push/sender';
import type { Hub } from '../realtime/hub';
import type { Scheduler } from './scheduler';

/** Dépendances partagées par les cas d'usage (injectées : remplaçables en test). */
export interface Deps {
  db: Database;
  tables: TableStore;
  writer: GameWriter;
  hub: Hub;
  scheduler: Scheduler;
  push: PushSender;
  rng: Rng;
  now: () => number;
}
