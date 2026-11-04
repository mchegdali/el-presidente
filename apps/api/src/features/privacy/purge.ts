// Durées de conservation annoncées sur la page /confidentialite du site, appliquées ici :
// messages du chat (et leur adresse IP, gardée pour la LCEN) un an, sessions et jetons de
// vérification jusqu'à leur expiration. Les signalements suivent leur message (cascade).

import { lt, schema } from '@el-presidente/db';
import type { Database } from '@el-presidente/db/types';

const { messages, session, verification } = schema;

/** Un an : durée de conservation des données d'identification des auteurs (LCEN). */
export const MESSAGE_RETENTION_MS = 365 * 24 * 60 * 60_000;

export function purgeExpired(db: Database, now: number) {
  return db.transaction((tx) => ({
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
  }));
}
