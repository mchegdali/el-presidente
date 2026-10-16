// Présence : un joueur est « en ligne » si au moins un de ses onglets est visible.
// Quand il passe hors ligne pendant son tour, il devient joignable par notification.

import type { Deps } from '../../shared/deps';
import { notifyTurn } from '../push/notify-turn';
import type { Table } from '../tables/shared/table';

export function setPresence(deps: Deps, table: Table, userId: string, delta: 1 | -1): void {
  const before = table.online.get(userId) ?? 0;
  const after = Math.max(0, before + delta);
  if (after === 0) table.online.delete(userId);
  else table.online.set(userId, after);
  if (before > 0 === after > 0) return;
  const seat = table.seatOf(userId);
  if (seat < 0) return;
  deps.hub.publish(table, { op: 'presence', seat, online: after > 0 });
  if (after === 0) notifyTurn(deps, table);
}
