// Tests de bout en bout de l'API. Les scénarios reprennent ceux de la version SQL
// (tests/engine.test.mjs « table et joueurs », tests/social.test.mjs).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cardsOf, createHands, parseCard, setHand, type GameState } from '@el-presidente/game';
import type { ServerMessage, TableSnapshot } from '@el-presidente/game/protocol';
import { z } from 'zod';
import { schema, eq } from '@el-presidente/db';
import { onTurnDeadline } from './features/game/turn-timeout/handler';
import { startTestServer, WEB_ORIGIN, type TestServer, type TestUser } from './testing/harness';

let s: TestServer;
beforeAll(async () => {
  s = await startTestServer();
});
afterAll(() => s.close());

const NAMES = ['Ana', 'Beto', 'Carla', 'Diego', 'Elena', 'Fito', 'Gabi', 'Hugo', 'Ines'];

type AnyResponse = { status: number; json(): Promise<unknown> };

async function json<T>(res: AnyResponse | Promise<AnyResponse>): Promise<{ status: number; body: T }> {
  const r = await res;
  return { status: r.status, body: (await r.json()) as T };
}

type ErrorBody = { error: { tag: string; message: string } };

async function setupTable(n: number) {
  const users: TestUser[] = [];
  for (let i = 0; i < n; i++) users.push(await s.login(NAMES[i]!));
  const created = await json<{ code: string }>(users[0]!.api.tables.$post({ json: {} }));
  expect(created.status).toBe(200);
  const code = created.body.code;
  for (const u of users.slice(1)) {
    const r = await u.api.tables[':code'].join.$post({ param: { code }, json: {} });
    expect(r.status).toBe(200);
  }
  return { code, users, host: users[0]! };
}

const isMove = (m: ServerMessage): m is Extract<ServerMessage, { op: 'move' }> => m.op === 'move';

/** Impose des mains et le premier joueur à la manche en cours (en mémoire). */
function forceHands(code: string, hands: string[][], turn: number) {
  const table = s.deps.tables.cached(code)!;
  const g = table.game as GameState;
  const h = createHands(g.n);
  hands.forEach((cs, seat) => setHand(h, seat, cs.map(parseCard)));
  g.hands = h;
  g.turn = turn;
  g.phase = 'playing';
  g.exchanges = [];
  table.status = 'playing';
  table.version += 1;
  s.deps.hub.sendSnapshots(table);
}

describe('authentification et sécurité', () => {
  test('sans session : 401 ; avec : le compte', async () => {
    const anon = await fetch(`${s.base}/me`);
    expect(anon.status).toBe(401);
    const u = await s.login('Zoé');
    const me = await json<{ id: string; name: string }>(u.api.me.$get());
    expect(me.body).toMatchObject({ id: u.userId, name: 'Zoé' });
  });

  test('requêtes qui modifient l’état : origine du site obligatoire', async () => {
    const u = await s.login('Zoé');
    const r = await fetch(`${s.base}/tables`, {
      method: 'POST',
      headers: { cookie: u.cookie, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });
    expect(r.status).toBe(403);
  });

  test('WebSocket : origine contrôlée', async () => {
    const { code, host } = await setupTable(1);
    const r = await fetch(`${s.base}/tables/${code}/ws`, {
      headers: { cookie: host.cookie, origin: 'https://evil.example', upgrade: 'websocket', connection: 'upgrade' },
    });
    expect(r.status).toBe(403);
  });

  test('entrée invalide : 400 avec le format d’erreur commun', async () => {
    const { code, host } = await setupTable(1);
    const r = await json<ErrorBody>(
      host.api.tables[':code'].settings.$patch({ param: { code }, json: { turnLimit: 'x' as never } }),
    );
    expect(r.status).toBe(400);
    expect(r.body.error.tag).toBe('Invalid');
  });
});

describe('table et joueurs', () => {
  test('rejoindre : nom unique, 8 joueurs max, pas pendant une manche, reconnexion', async () => {
    const t = await setupTable(8);
    const late = await s.login('Zoé');
    let r = await json<ErrorBody>(late.api.tables[':code'].join.$post({ param: { code: t.code }, json: {} }));
    expect(r.body.error.message).toMatch(/complète/);

    await t.users[7]!.api.tables[':code'].leave.$post({ param: { code: t.code } });
    const ana = await s.login('Ana');
    r = await json<ErrorBody>(ana.api.tables[':code'].join.$post({ param: { code: t.code }, json: { name: ' ana ' } }));
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/déjà pris/);

    // Code en minuscules accepté, même compte = même joueur.
    const again = await json<TableSnapshot>(
      t.users[1]!.api.tables[':code'].join.$post({ param: { code: t.code.toLowerCase() }, json: {} }),
    );
    expect(again.body.me).toBe(1);

    await t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } });
    r = await json<ErrorBody>(late.api.tables[':code'].join.$post({ param: { code: t.code }, json: {} }));
    expect(r.body.error.message).toMatch(/manche est en cours/);

    const missing = await json<ErrorBody>(late.api.tables[':code'].$get({ param: { code: 'ZZZZZ' } }));
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe("Cette table n'existe pas.");
  });

  test('les mains des autres ne sont jamais visibles', async () => {
    const t = await setupTable(3);
    await t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } });
    const outsider = await s.login('Intrus');
    const seen = await json<TableSnapshot>(outsider.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(seen.body.me).toBeNull();
    expect(seen.body.hand).toBeNull();
    const mine = await json<TableSnapshot>(t.host.api.tables[':code'].$get({ param: { code: t.code } }));
    const other = await json<TableSnapshot>(t.users[1]!.api.tables[':code'].$get({ param: { code: t.code } }));
    const text = JSON.stringify(mine.body);
    for (const c of other.body.hand!) expect(text.includes(`"${c}"`)).toBe(false);
  });

  test('seul l’hôte lance ; 3 joueurs minimum ; départ en cours de manche', async () => {
    const t = await setupTable(3);
    let r = await json<ErrorBody>(t.users[1]!.api.tables[':code'].rounds.$post({ param: { code: t.code } }));
    expect(r.body.error.message).toMatch(/Seul le créateur/);
    const started = await json<TableSnapshot>(t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } }));
    expect(started.body.status).toBe('playing');
    expect(started.body.hand!.length + started.body.game!.counts.slice(1).reduce((a, b) => a + b, 0)).toBe(52);

    await t.users[2]!.api.tables[':code'].leave.$post({ param: { code: t.code } });
    const after = await json<TableSnapshot>(t.host.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(after.body.status).toBe('waiting');
    expect(after.body.game).toBeNull();
    expect(after.body.notice).toMatch(/Carla a quitté/);
    r = await json<ErrorBody>(t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } }));
    expect(r.body.error.message).toMatch(/au moins 3/);
  });

  test('l’hôte qui part transmet la table ; exclusion ; annulation', async () => {
    const t = await setupTable(4);
    await t.host.api.tables[':code'].leave.$post({ param: { code: t.code } });
    let snap = await json<TableSnapshot>(t.users[1]!.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(snap.body.hostSeat).toBe(0);
    expect(snap.body.players[0]!.id).toBe(t.users[1]!.userId);

    const r = await json<ErrorBody>(
      t.users[2]!.api.tables[':code'].kick.$post({ param: { code: t.code }, json: { userId: t.users[3]!.userId } }),
    );
    expect(r.body.error.message).toMatch(/Seul le créateur/);

    await t.host.api.tables[':code'].join.$post({ param: { code: t.code }, json: {} });
    await t.users[1]!.api.tables[':code'].rounds.$post({ param: { code: t.code } });
    snap = await json<TableSnapshot>(
      t.users[1]!.api.tables[':code'].rounds.current.$delete({ param: { code: t.code } }),
    );
    expect(snap.body.status).toBe('waiting');
    expect(snap.body.notice).toMatch(/Manche annulée par Beto/);
    snap = await json<TableSnapshot>(
      t.users[1]!.api.tables[':code'].kick.$post({ param: { code: t.code }, json: { userId: t.users[3]!.userId } }),
    );
    expect(snap.body.players.length).toBe(3);
  });

  test('le dernier qui part ferme la table', async () => {
    const t = await setupTable(1);
    await t.host.api.tables[':code'].leave.$post({ param: { code: t.code } });
    const r = await t.host.api.tables[':code'].$get({ param: { code: t.code } });
    expect(r.status).toBe(404);
  });
});

describe('temps réel', () => {
  test('coups par WebSocket : accusé, refus, deltas diffusés à tous', async () => {
    const t = await setupTable(3);
    await t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } });
    const sockets = await Promise.all(t.users.map((u) => u.connect(t.code)));
    await Promise.all(sockets.map((c) => c.snapshot()));
    forceHands(
      t.code,
      [
        ['5S', '9S', '3S'],
        ['6S', '4S'],
        ['7S', 'TS'],
      ],
      0,
    );
    const snaps = await Promise.all(sockets.map((c) => c.snapshot()));
    expect(snaps[0]!.snapshot.hand).toEqual(['3S', '5S', '9S']);

    let r = await sockets[1]!.request({ op: 'pass', req: 0 });
    expect(r).toMatchObject({ op: 'reject', message: "Ce n'est pas votre tour." });
    r = await sockets[0]!.request({ op: 'play', req: 0, cards: [parseCard('5S')] });
    expect(r.op).toBe('ack');
    const deltas = await Promise.all(sockets.map((c) => c.next(isMove)));
    for (const d of deltas) expect(d).toMatchObject({ kind: 'play', seat: 0, cards: [parseCard('5S')], turn: 1 });
    expect(deltas[0]!.version).toBe(snaps[0]!.snapshot.version + 1);

    r = await sockets[1]!.request({ op: 'play', req: 0, cards: [parseCard('4S')] });
    expect(r).toMatchObject({ op: 'reject', message: 'Il faut jouer une valeur égale ou supérieure.' });
    for (const c of sockets) c.close();
  });

  test('message malformé : connexion fermée', async () => {
    const t = await setupTable(1);
    const c = await t.host.connect(t.code);
    await c.snapshot();
    const closed = new Promise<number>((resolve) => c.ws.addEventListener('close', (e) => resolve(e.code)));
    c.ws.send(new Uint8Array([0x01, 0, 1, 1, 99]));
    expect(await closed).toBe(1007);
  });

  test('une manche survit à un redémarrage (écriture différée puis rechargement)', async () => {
    const t = await setupTable(3);
    await t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } });
    const c = await t.host.connect(t.code);
    const snap = (await c.snapshot()).snapshot;
    const first = snap.game!.turn;
    const player = t.users[first]!;
    const pc = await player.connect(t.code);
    const ps = (await pc.snapshot()).snapshot;
    expect((await pc.request({ op: 'play', req: 0, cards: [parseCard(ps.hand![0]!)] })).op).toBe('ack');
    c.close();
    pc.close();
    await s.deps.writer.flush();

    const before = s.deps.tables.cached(t.code)!;
    const hands = Array.from({ length: 3 }, (_, i) => cardsOf(before.game!.hands, i));
    s.deps.tables.remove(before); // comme après un redémarrage : plus rien en mémoire
    const reloaded = await s.deps.tables.get(t.code);
    expect(reloaded.isOk()).toBe(true);
    const table = reloaded.unwrap();
    expect(table).not.toBe(before);
    expect(table.version).toBe(before.version);
    expect(Array.from({ length: 3 }, (_, i) => cardsOf(table.game!.hands, i))).toEqual(hands);
  });
});

describe('passe automatique', () => {
  test('seul l’hôte règle le délai ; désactivé par défaut', async () => {
    const t = await setupTable(3);
    let snap = await json<TableSnapshot>(t.host.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(snap.body.turnLimit).toBeNull();
    const r = await json<ErrorBody>(
      t.users[1]!.api.tables[':code'].settings.$patch({ param: { code: t.code }, json: { turnLimit: 30 } }),
    );
    expect(r.body.error.message).toMatch(/Seul le créateur/);
    const bad = await json<ErrorBody>(
      t.host.api.tables[':code'].settings.$patch({ param: { code: t.code }, json: { turnLimit: 3 } }),
    );
    expect(bad.body.error.message).toMatch(/Délai invalide/);
    snap = await json<TableSnapshot>(
      t.host.api.tables[':code'].settings.$patch({ param: { code: t.code }, json: { turnLimit: 30 } }),
    );
    expect(snap.body.turnLimit).toBe(30);
    snap = await json<TableSnapshot>(
      t.host.api.tables[':code'].settings.$patch({ param: { code: t.code }, json: { turnLimit: 0 } }),
    );
    expect(snap.body.turnLimit).toBeNull();
  });

  test('délai dépassé : le joueur passe ; avant le délai, rien ne se passe ; diffusé en delta', async () => {
    const t = await setupTable(3);
    await t.host.api.tables[':code'].settings.$patch({ param: { code: t.code }, json: { turnLimit: 30 } });
    await t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } });
    const c = await t.users[2]!.connect(t.code);
    await c.snapshot();
    forceHands(
      t.code,
      [
        ['5S', '3S'],
        ['6H', '4S'],
        ['8D', '5H'],
      ],
      0,
    );
    await c.snapshot();
    const host = await t.host.connect(t.code);
    await host.snapshot();
    expect((await host.request({ op: 'play', req: 0, cards: [parseCard('5S')] })).op).toBe('ack');
    await c.next(isMove);
    expect(s.deps.scheduler.size).toBeGreaterThan(0);

    s.clock.t += 29_000;
    await onTurnDeadline(s.deps, t.code);
    expect(s.deps.tables.cached(t.code)!.game!.turn).toBe(1);

    s.clock.t += 2_000;
    await onTurnDeadline(s.deps, t.code);
    const d = await c.next(isMove);
    expect(d).toMatchObject({ kind: 'pass', seat: 1, turn: 2 });
    expect(d.events[0]).toMatchObject({ type: 'timeout', player: 1, action: 'pass' });
    c.close();
    host.close();
  });
});

describe('présence et notifications push', () => {
  test('le joueur absent dont c’est le tour est notifié, une seule fois par tour', async () => {
    const t = await setupTable(3);
    for (const u of t.users) s.push.subscribed.add(u.userId);
    const sockets = [await t.users[0]!.connect(t.code), null, await t.users[2]!.connect(t.code)];
    await sockets[0]!.snapshot();
    await sockets[2]!.snapshot();
    const snap = await json<TableSnapshot>(t.host.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(snap.body.players.map((p) => p.online)).toEqual([true, false, true]);

    await t.host.api.tables[':code'].rounds.$post({ param: { code: t.code } });
    forceHands(
      t.code,
      [
        ['5S', '3S'],
        ['6H', '4S'],
        ['8D', '5H'],
      ],
      0,
    );
    s.push.sent = [];
    await sockets[0]!.request({ op: 'play', req: 0, cards: [parseCard('5S')] });
    expect(s.push.sent.map((p) => p.userId)).toEqual([t.users[1]!.userId]);
    expect(s.push.sent[0]!.payload.url).toBe(`/t/${t.code}`);

    // Beto revient puis repart : déjà notifié pour ce tour.
    const beto = await t.users[1]!.connect(t.code);
    await beto.snapshot();
    beto.send({ op: 'presence', active: false });
    await Bun.sleep(30);
    expect(s.push.sent.length).toBe(1);

    // Carla passe son onglet en arrière-plan pendant son tour : notifiée.
    beto.send({ op: 'presence', active: true });
    await Bun.sleep(30);
    await beto.request({ op: 'play', req: 0, cards: [parseCard('6H')] });
    expect(s.push.sent.length).toBe(1);
    sockets[2]!.send({ op: 'presence', active: false });
    await Bun.sleep(30);
    expect(s.push.sent.map((p) => p.userId)).toEqual([t.users[1]!.userId, t.users[2]!.userId]);
    for (const c of [sockets[0], sockets[2], beto]) c!.close();
  });

  test('abonnement : invalide refusé, valide accepté', async () => {
    const u = await s.login('Zoé');
    const bad = await u.api.push.subscriptions.$post({
      json: { endpoint: 'http://evil', keys: { p256dh: 'x', auth: 'y' } },
    });
    expect(bad.status).toBe(400);
    const ok = await u.api.push.subscriptions.$post({
      json: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
      },
    });
    expect(ok.status).toBe(200);
  });
});

describe('chat et emotes', () => {
  const messageSchema = z.object({
    id: z.number(),
    p: z.string().nullable(),
    name: z.string(),
    body: z.string(),
    at: z.number(),
  });

  test('messages, historique (JSON construit par Postgres), limite de débit, membres seulement', async () => {
    const t = await setupTable(3);
    const sockets = await Promise.all(t.users.map((u) => u.connect(t.code)));
    await Promise.all(sockets.map((c) => c.snapshot()));
    expect((await sockets[0]!.request({ op: 'chat', req: 0, body: '  ¡Hola! 🌶️  ' })).op).toBe('ack');
    const got = await sockets[2]!.next((m): m is Extract<ServerMessage, { op: 'chat' }> => m.op === 'chat');
    expect(got.message).toMatchObject({ body: '¡Hola! 🌶️', name: 'Ana', p: t.users[0]!.userId });
    await sockets[1]!.request({ op: 'chat', req: 0, body: '@Ana à toi' });

    let history = await json<unknown>(
      t.users[2]!.api.tables[':code'].messages.$get({ param: { code: t.code }, query: {} }),
    );
    const list = z.array(messageSchema).parse(history.body);
    expect(list.map((m) => m.body)).toEqual(['¡Hola! 🌶️', '@Ana à toi']);
    history = await json<unknown>(
      t.users[2]!.api.tables[':code'].messages.$get({ param: { code: t.code }, query: { after: String(list[0]!.id) } }),
    );
    expect(z.array(messageSchema).parse(history.body).length).toBe(1);
    const snap = await json<TableSnapshot>(t.host.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(snap.body.chatLast).toBe(list[1]!.id);

    expect(await sockets[0]!.request({ op: 'chat', req: 0, body: '   ' })).toMatchObject({ message: 'Message vide.' });
    expect(await sockets[0]!.request({ op: 'chat', req: 0, body: 'x'.repeat(301) })).toMatchObject({ op: 'reject' });
    for (let i = 0; i < 3; i++) await sockets[0]!.request({ op: 'chat', req: 0, body: `m${i}` });
    expect((await sockets[0]!.request({ op: 'chat', req: 0, body: 'spam' })).op).toBe('reject');

    const intrus = await s.login('Intrus');
    const denied = await intrus.api.tables[':code'].messages.$get({ param: { code: t.code }, query: {} });
    expect(denied.status).toBe(403);
    const ic = await intrus.connect(t.code);
    await ic.snapshot();
    expect((await ic.request({ op: 'chat', req: 0, body: 'coucou' })).op).toBe('reject');

    // Le journal garde l'auteur (LCEN).
    const rows = await s.database.db.select().from(schema.messages).where(eq(schema.messages.body, '¡Hola! 🌶️'));
    expect(rows[0]!.userId).toBe(t.users[0]!.userId);
    for (const c of [...sockets, ic]) c.close();
  });

  test('une @mention notifie le joueur absent abonné', async () => {
    const t = await setupTable(3);
    s.push.subscribed.add(t.users[2]!.userId);
    s.push.sent = [];
    const c = await t.host.connect(t.code);
    await c.snapshot();
    await c.request({ op: 'chat', req: 0, body: 'Allez @carla, on t’attend' });
    expect(s.push.sent.map((p) => [p.userId, p.payload.title])).toEqual([[t.users[2]!.userId, 'Ana vous mentionne']]);
    c.close();
  });

  test('emotes : une par seconde, visibles quelques secondes', async () => {
    const t = await setupTable(2);
    const a = await t.host.connect(t.code);
    const b = await t.users[1]!.connect(t.code);
    await a.snapshot();
    await b.snapshot();
    a.send({ op: 'emote', emote: 3 });
    a.send({ op: 'emote', emote: 1 });
    const e = await b.next((m): m is Extract<ServerMessage, { op: 'emote' }> => m.op === 'emote');
    expect(e).toMatchObject({ seat: 0, emote: 3 });
    await Bun.sleep(50);
    expect(b.inbox.filter((m) => m.op === 'emote').length).toBe(0);
    let snap = await json<TableSnapshot>(t.users[1]!.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(snap.body.players[0]!.emote).toBe(3);
    s.clock.t += 6000;
    snap = await json<TableSnapshot>(t.users[1]!.api.tables[':code'].$get({ param: { code: t.code } }));
    expect(snap.body.players[0]!.emote).toBeNull();
    a.close();
    b.close();
  });
});

test('origine du site utilisée dans les tests', () => expect(WEB_ORIGIN).toStartWith('https://'));
