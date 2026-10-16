import { gameView, handView } from '@el-presidente/game';
import type { TableSnapshot } from '@el-presidente/game/protocol';
import type { Table } from './table';

const EMOTE_VISIBLE_MS = 5000;

/** État complet de la table vu par `userId` (null : visiteur qui n'est pas à la table). */
export function snapshotFor(table: Table, userId: string | null, now = Date.now()): TableSnapshot {
  const me = userId === null ? -1 : table.seatOf(userId);
  const g = table.game;
  return {
    version: table.version,
    code: table.code,
    status: table.status,
    roundNo: table.roundNo,
    hostSeat: table.hostId === null ? -1 : table.seatOf(table.hostId),
    notice: table.notice,
    turnLimit: table.turnLimit,
    me: me < 0 ? null : me,
    players: table.players.map((p, seat) => {
      const emote = table.emotes.get(p.userId);
      const visible = emote !== undefined && emote.at > now - EMOTE_VISIBLE_MS;
      return {
        id: p.userId,
        seat,
        name: p.name,
        image: p.image,
        role: p.role,
        online: table.isOnline(p.userId),
        emote: visible ? emote.emote : null,
        emoteAt: visible ? emote.at : null,
      };
    }),
    game: g === null ? null : gameView(g, me < 0 ? null : me),
    hand: g === null || me < 0 || me >= g.n ? null : handView(g, me),
    chatLast: me < 0 ? null : table.chatLast,
    now,
  };
}
