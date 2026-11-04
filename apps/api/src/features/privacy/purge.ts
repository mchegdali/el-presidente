// Durées de conservation annoncées sur la page /confidentialite du site, appliquées ici :
// messages du chat (et leur adresse IP, gardée pour la LCEN) un an, sessions et jetons de
// vérification jusqu'à leur expiration, tables 30 jours après leur dernière activité. Les
// signalements suivent leur message (cascade).

import { and, eq, inArray, lt, notExists, schema, sql } from '@el-presidente/db';
import type { Database } from '@el-presidente/db/types';

const { games, lobbies, messages, players, session, verification } = schema;

/** Un an : durée de conservation des données d'identification des auteurs (LCEN). */
export const MESSAGE_RETENTION_MS = 365 * 24 * 60 * 60_000;

/** Une table sans coup, réglage ni message depuis 30 jours est fermée. */
export const TABLE_RETENTION_MS = 30 * 24 * 60 * 60_000;

/**
 * Purge des données expirées. `live` : tables chargées en mémoire (jamais touchées, l'API
 * peut encore les écrire).
 *
 * Une table abandonnée perd ses joueurs (pseudos, rôles) et sa manche : elle n'existe plus
 * pour le site. Ses messages, eux, doivent rester un an (LCEN) et tiennent à la table par
 * une clé étrangère : la ligne de la table reste donc, vide, jusqu'à l'expiration de son
 * dernier message, puis disparaît à la purge suivante.
 */
export function purgeExpired(db: Database, now: number, live: ReadonlySet<string> = new Set()) {
  const cutoff = new Date(now - TABLE_RETENTION_MS);
  return db.transaction((tx) => {
    const purged = {
      messages: tx
        .delete(messages)
        .where(lt(messages.createdAt, new Date(now - MESSAGE_RETENTION_MS)))
        .returning({ id: messages.id })
        .all().length,
      sessions: tx
        .delete(session)
        .where(lt(session.expiresAt, new Date(now)))
        .returning({ id: session.id })
        .all().length,
      verifications: tx
        .delete(verification)
        .where(lt(verification.expiresAt, new Date(now)))
        .returning({ id: verification.id })
        .all().length,
      tables: 0,
    };

    // Dernière activité : réglages et statut (lobbies), coups (games), chat (messages).
    const idle = tx
      .select({ id: lobbies.id })
      .from(lobbies)
      .leftJoin(games, eq(games.lobbyId, lobbies.id))
      .where(
        and(
          lt(lobbies.updatedAt, cutoff),
          sql`coalesce(${games.updatedAt}, 0) < ${cutoff.getTime()}`,
          notExists(
            tx
              .select({ one: sql`1` })
              .from(messages)
              .where(and(eq(messages.lobbyId, lobbies.id), sql`${messages.createdAt} >= ${cutoff.getTime()}`)),
          ),
        ),
      )
      .all()
      .map((r) => r.id)
      .filter((id) => !live.has(id));
    if (idle.length === 0) return purged;

    tx.delete(games).where(inArray(games.lobbyId, idle)).run();
    const seated = tx.delete(players).where(inArray(players.lobbyId, idle)).returning({ id: players.lobbyId }).all();
    purged.tables = new Set(seated.map((r) => r.id)).size;
    // Lignes vides (sans joueurs) supprimées dès qu'aucun message n'y tient plus.
    tx.delete(lobbies)
      .where(
        and(
          inArray(lobbies.id, idle),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(messages)
              .where(eq(messages.lobbyId, lobbies.id)),
          ),
        ),
      )
      .run();
    return purged;
  });
}
