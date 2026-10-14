import type { Deps } from '../../../shared/deps';
import type { Table } from '../../tables/shared/table';

/** Emote rapide : une par seconde et par joueur, les suivantes sont ignorées. */
export function sendEmote(deps: Deps, table: Table, userId: string, emote: number): boolean {
  const seat = table.seatOf(userId);
  if (seat < 0) return false;
  const now = deps.now();
  const last = table.emotes.get(userId);
  if (last !== undefined && last.at > now - 1000) return false;
  table.emotes.set(userId, { emote, at: now });
  deps.hub.publish(table, { op: 'emote', seat, emote, at: now });
  return true;
}
