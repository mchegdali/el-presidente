// Envoi des notifications Web Push (VAPID), hors du chemin chaud : fire-and-forget,
// abonnements expirés (404/410) supprimés.

import { schema, type Database } from '@el-presidente/db';
import { eq } from '@el-presidente/db';
import webpush from 'web-push';
import { log } from '../../shared/logger';

const { pushSubscriptions } = schema;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushSender {
  readonly publicKey: string | null;
  /** Notifie tous les appareils abonnés du compte. */
  send(userId: string, payload: PushPayload): void;
  /** Le compte a-t-il au moins un appareil abonné ? */
  hasSubscription(userId: string): Promise<boolean>;
}

export function createPushSender(
  db: Database,
  vapid: { publicKey?: string; privateKey?: string; subject?: string },
): PushSender {
  const enabled = Boolean(vapid.publicKey && vapid.privateKey && vapid.subject);
  if (enabled) webpush.setVapidDetails(vapid.subject!, vapid.publicKey!, vapid.privateKey!);

  async function deliver(userId: string, payload: PushPayload) {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60,
            urgency: 'high',
          });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
          } else {
            log.warn('push', { status, error: String(error) });
          }
        }
      }),
    );
  }

  return {
    publicKey: enabled ? vapid.publicKey! : null,
    send(userId, payload) {
      if (!enabled) return;
      deliver(userId, payload).catch((error) => log.warn('push', { error: String(error) }));
    },
    async hasSubscription(userId) {
      if (!enabled) return false;
      const rows = await db
        .select({ e: pushSubscriptions.endpoint })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
        .limit(1);
      return rows.length > 0;
    },
  };
}
