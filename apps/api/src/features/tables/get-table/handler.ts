import type { Deps } from '../../../shared/deps';
import type { CurrentUser } from '../../auth/session';
import { snapshotFor } from '../shared/snapshot';

/** État de la table pour l'utilisateur (visiteur s'il n'y est pas assis). */
export async function getTable(deps: Deps, code: string, user: CurrentUser | null) {
  const table = await deps.tables.get(code);
  return table.map((t) => snapshotFor(t, user?.id ?? null, deps.now()));
}
