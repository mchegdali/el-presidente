// Alertes de vmalert (format de l'API Alertmanager v2) relayées en notifications push vers
// les comptes administrateurs : pas d'Alertmanager ni de service de messagerie à faire
// tourner. Une notification au déclenchement, une à la résolution, un rappel toutes les
// 6 heures tant que l'alerte dure ; vmalert renvoie les alertes actives à chaque évaluation.

import { and, eq, inArray, schema } from '@el-presidente/db';
import { z } from 'zod';
import type { Deps } from '../../shared/deps';
import { log } from '../../shared/logger';

const { user } = schema;

export const alertsSchema = z
  .array(
    z.object({
      labels: z.record(z.string(), z.string()),
      annotations: z.record(z.string(), z.string()).optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
    }),
  )
  .max(500);

export type Alert = z.infer<typeof alertsSchema>[number];

const REMIND_MS = 6 * 60 * 60_000;

/** Empreinte d'une alerte : ses étiquettes, dans l'ordre. */
const fingerprint = (labels: Record<string, string>) =>
  JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));

export class AlertRelay {
  /** Alertes actives déjà notifiées, avec l'heure de la dernière notification. */
  private readonly firing = new Map<string, number>();

  constructor(
    private readonly deps: Deps,
    private readonly adminEmails: readonly string[],
  ) {}

  /** Traite un envoi de vmalert ; renvoie le nombre de notifications envoyées. */
  receive(alerts: readonly Alert[]): number {
    const now = this.deps.now();
    const messages: { title: string; body: string }[] = [];
    for (const a of alerts) {
      const key = fingerprint(a.labels);
      const name = a.labels.alertname ?? 'alerte';
      const summary = a.annotations?.summary ?? a.annotations?.description ?? '';
      const resolved = a.endsAt !== undefined && Date.parse(a.endsAt) <= now;
      if (resolved) {
        if (this.firing.delete(key)) messages.push({ title: `✅ Résolu : ${name}`, body: summary });
        continue;
      }
      const last = this.firing.get(key);
      if (last !== undefined && now - last < REMIND_MS) continue;
      this.firing.set(key, now);
      messages.push({ title: `${last === undefined ? '🔴' : '⏰ Toujours'} ${name}`, body: summary });
    }
    if (messages.length === 0) return 0;

    const admins = this.admins();
    if (admins.length === 0) {
      log.warn('alertes sans destinataire (ADMIN_EMAILS)', { alerts: messages.map((m) => m.title) });
      return 0;
    }
    for (const m of messages) {
      log.warn('alerte', m);
      for (const id of admins) this.deps.push.send(id, { ...m, url: '/' });
    }
    return messages.length * admins.length;
  }

  private admins(): string[] {
    if (this.adminEmails.length === 0) return [];
    return this.deps.db
      .select({ id: user.id })
      .from(user)
      .where(and(inArray(user.email, [...this.adminEmails]), eq(user.isAnonymous, false)))
      .all()
      .map((r) => r.id);
  }
}
