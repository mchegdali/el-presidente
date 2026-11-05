// Compte invité rattaché à un compte Google (« Garder mon compte avec Google »).
//
// Appelé par better-auth (plugin `anonymous`, `onLinkAccount`) juste avant qu'il supprime
// l'invité : tout ce qui lui appartient passe au compte Google, sinon la suppression en
// cascade effacerait ses places aux tables et ses abonnements aux notifications.

import { and, eq, inArray, schema } from '@el-presidente/db';
import type { Deps } from '../../shared/deps';
import { log } from '../../shared/logger';
import { lobbyChanged } from '../tables/shared/lobby-changed';
import { removePlayer } from '../tables/leave-table/handler';

const { lobbies, messageReports, messages, players, pushSubscriptions } = schema;

/** Déplace une entrée d'une Map d'un compte à l'autre. */
function moveKey<V>(map: Map<string, V>, from: string, to: string): void {
  const value = map.get(from);
  map.delete(from);
  if (value !== undefined && !map.has(to)) map.set(to, value);
}

export async function linkGuest(
  deps: Deps,
  guestId: string,
  user: { id: string; image?: string | null },
): Promise<void> {
  if (guestId === user.id) return;

  // 1. Places aux tables : chaque table est chargée en mémoire et modifiée sous son verrou,
  //    comme pour toute action. Si le compte Google y est déjà assis, la place de l'invité
  //    est libérée (manche en cours annulée, comme un départ).
  const seats = deps.db
    .select({ code: lobbies.code })
    .from(players)
    .innerJoin(lobbies, eq(lobbies.id, players.lobbyId))
    .where(eq(players.userId, guestId))
    .all();
  for (const { code } of seats) {
    const found = await deps.tables.get(code);
    if (found.isErr()) {
      log.error('liaison invité', { code, error: found.error.message });
      continue;
    }
    const table = found.value;
    await table.exclusive(async () => {
      const seat = table.seatOf(guestId);
      if (seat < 0) return;
      if (table.seatOf(user.id) >= 0) {
        const name = table.players[seat]!.name;
        await removePlayer(deps, table, guestId, `${name} a rejoint son compte Google : manche annulée.`);
        return;
      }
      deps.db.transaction((tx) => {
        tx.update(players)
          .set({ userId: user.id })
          .where(and(eq(players.lobbyId, table.id), eq(players.userId, guestId)))
          .run();
        if (table.hostId === guestId) tx.update(lobbies).set({ hostId: user.id }).where(eq(lobbies.id, table.id)).run();
      });
      const p = table.players[seat]!;
      p.userId = user.id;
      p.image = user.image ?? null;
      if (table.hostId === guestId) table.hostId = user.id;
      moveKey(table.online, guestId, user.id);
      moveKey(table.emotes, guestId, user.id);
      moveKey(table.notified, guestId, user.id);
      lobbyChanged(deps, table);
    });
  }

  // 2. Le reste, d'un bloc : messages (auteur), tables créées, abonnements, signalements.
  deps.db.transaction((tx) => {
    tx.update(messages).set({ userId: user.id }).where(eq(messages.userId, guestId)).run();
    tx.update(lobbies).set({ hostId: user.id }).where(eq(lobbies.hostId, guestId)).run();
    tx.update(pushSubscriptions).set({ userId: user.id }).where(eq(pushSubscriptions.userId, guestId)).run();
    // Un seul signalement par message et par compte : les doublons de l'invité disparaissent.
    const already = tx
      .select({ id: messageReports.messageId })
      .from(messageReports)
      .where(eq(messageReports.reporterId, user.id))
      .all()
      .map((r) => r.id);
    if (already.length > 0) {
      tx.delete(messageReports)
        .where(and(eq(messageReports.reporterId, guestId), inArray(messageReports.messageId, already)))
        .run();
    }
    tx.update(messageReports).set({ reporterId: user.id }).where(eq(messageReports.reporterId, guestId)).run();
  });
}
