import type { Deps } from '../../../shared/deps';
import type { Table } from './table';

/** Changement de structure (joueurs, réglages, manche) : état complet à chacun. */
export function lobbyChanged(deps: Deps, table: Table): void {
  table.version += 1;
  table.lastActivity = deps.now();
  deps.scheduler.set(table.code, table.deadline());
  deps.hub.sendSnapshots(table, deps.now());
}
