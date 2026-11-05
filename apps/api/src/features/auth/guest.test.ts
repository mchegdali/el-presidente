// Comptes invités : connexion sans Google, jeu et chat, rattachement à un compte Google,
// purge après expiration de la session.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, schema } from '@el-presidente/db';
import type { TableSnapshot } from '@el-presidente/game/protocol';
import { startTestServer, WEB_ORIGIN, type TestServer } from '../../testing/harness';
import { purgeExpired } from '../privacy/purge';
import { linkGuest } from './link-guest';

let s: TestServer;
beforeAll(async () => {
  s = await startTestServer();
});
afterAll(() => s.close());

const snapshot = async (res: Promise<{ status: number; json(): Promise<unknown> }>) => {
  const r = await res;
  expect(r.status).toBe(200);
  return (await r.json()) as TableSnapshot;
};

/** Ce que fait better-auth après `onLinkAccount` : l'invité est supprimé. */
const deleteUser = (id: string) => s.deps.db.delete(schema.user).where(eq(schema.user.id, id)).run();

describe('comptes invités', () => {
  test('sans Google : compte invité, table créée, chat ; un deuxième invité rejoint', async () => {
    const g = await s.guest();
    const me = (await (await g.api.me.$get()).json()) as { name: string; isAnonymous: boolean };
    expect(me).toMatchObject({ name: 'Invité', isAnonymous: true });

    const created = (await (await g.api.tables.$post({ json: { name: 'Pancho' } })).json()) as { code: string };
    const other = await s.guest();
    const snap = await snapshot(
      other.api.tables[':code'].join.$post({ param: { code: created.code }, json: { name: 'Lola' } }),
    );
    expect(snap.players.map((p) => p.name)).toEqual(['Pancho', 'Lola']);

    const c = await g.connect(created.code);
    await c.snapshot();
    expect((await c.request({ op: 'chat', req: 0, body: 'hola' })).op).toBe('ack');
    c.close();
  });

  test('rattachement à Google : places, hôte, messages et abonnements suivent ; conflit de place', async () => {
    const g = await s.guest();
    const google = await s.login('Ana');
    s.push.subscribed.add(g.userId);

    // Table A : l'invité est hôte, seul compte de la table. Table B : les deux y sont assis.
    const a = ((await (await g.api.tables.$post({ json: { name: 'Pancho' } })).json()) as { code: string }).code;
    const b = ((await (await google.api.tables.$post({ json: { name: 'Ana' } })).json()) as { code: string }).code;
    await snapshot(g.api.tables[':code'].join.$post({ param: { code: b }, json: { name: 'Pancho' } }));
    const c = await g.connect(a);
    await c.snapshot();
    await c.request({ op: 'chat', req: 0, body: 'je garde mes messages' });
    c.close();
    s.deps.db
      .insert(schema.pushSubscriptions)
      .values({ endpoint: 'https://push.test/1', userId: g.userId, p256dh: 'k', auth: 'a' })
      .run();

    await linkGuest(s.deps, g.userId, { id: google.userId, image: null });
    deleteUser(g.userId);

    const tableA = await snapshot(google.api.tables[':code'].$get({ param: { code: a } }));
    expect(tableA.me).toBe(0);
    expect(tableA.hostSeat).toBe(0);
    expect(tableA.players[0]).toMatchObject({ id: google.userId, name: 'Pancho' });
    const tableB = await snapshot(google.api.tables[':code'].$get({ param: { code: b } }));
    expect(tableB.players.map((p) => p.name)).toEqual(['Ana']);

    // Base : rien n'a été emporté par la suppression de l'invité.
    const { db } = s.deps;
    expect(db.select().from(schema.players).where(eq(schema.players.userId, google.userId)).all().length).toBe(2);
    const msg = db.select().from(schema.messages).where(eq(schema.messages.body, 'je garde mes messages')).get()!;
    expect(msg.userId).toBe(google.userId);
    const sub = db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, 'https://push.test/1'))
      .get()!;
    expect(sub.userId).toBe(google.userId);

    // Après rechargement depuis la base, même état.
    for (const code of [a, b]) s.deps.tables.remove(s.deps.tables.cached(code)!);
    expect((await snapshot(google.api.tables[':code'].$get({ param: { code: a } }))).me).toBe(0);
  });

  test('de bout en bout par better-auth : une connexion depuis la session invité rattache ses places', async () => {
    const g = await s.guest();
    const code = ((await (await g.api.tables.$post({ json: { name: 'Pancho' } })).json()) as { code: string }).code;

    // Inscription depuis le navigateur de l'invité (son cookie) : même chemin que le retour de Google.
    const res = await fetch(`${s.base}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN, cookie: g.cookie },
      body: JSON.stringify({ name: 'Pancho Villa', email: 'pancho@example.org', password: 'mot-de-passe-solide' }),
    });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as { user: { id: string } };
    expect(user.id).not.toBe(g.userId);

    // L'invité a été supprimé par better-auth, après que sa place a suivi.
    const { db } = s.deps;
    expect(db.select().from(schema.user).where(eq(schema.user.id, g.userId)).get()).toBeUndefined();
    const table = s.deps.tables.cached(code)!;
    expect(table.players.map((p) => p.userId)).toEqual([user.id]);
    expect(table.hostId).toBe(user.id);
    expect(db.select().from(schema.players).where(eq(schema.players.userId, user.id)).all().length).toBe(1);
  });

  test('purge : invité sans session valide supprimé, sauf s’il est assis à une table chargée', async () => {
    const gone = await s.guest();
    const seated = await s.guest();
    const code = ((await (await seated.api.tables.$post({ json: { name: 'Lola' } })).json()) as { code: string }).code;
    const { db } = s.deps;
    for (const id of [gone.userId, seated.userId]) {
      db.update(schema.session)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.session.userId, id))
        .run();
    }
    const live = s.deps.tables.cached(code)!;
    const n = purgeExpired(db, Date.now(), { tables: new Set([live.id]), users: new Set([seated.userId]) });
    expect(n.guests).toBe(1);
    expect(db.select().from(schema.user).where(eq(schema.user.id, gone.userId)).get()).toBeUndefined();
    expect(db.select().from(schema.user).where(eq(schema.user.id, seated.userId)).get()).toBeDefined();
  });
});
