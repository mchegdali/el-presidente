// Passe automatique, présence, notifications push, chat et emotes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rpc } from './db.mjs';

const NAMES = ['Ana', 'Beto', 'Carla', 'Diego'];

async function setupTable(db, n) {
  const tokens = NAMES.slice(0, n).map((name) => `token-${name}-0123456789abcdef`);
  const created = await rpc(db, 'create_lobby', { p_token: tokens[0], p_name: NAMES[0] });
  const code = created.lobby.code;
  for (let i = 1; i < n; i++) await rpc(db, 'join_lobby', { p_code: code, p_token: tokens[i], p_name: NAMES[i] });
  const state = await rpc(db, 'get_state', { p_code: code, p_token: tokens[0] });
  return { code, tokens, ids: state.players.map((p) => p.id), host: tokens[0] };
}

async function forceRound(db, t, hands, turn) {
  await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
  const handsJson = Object.fromEntries(t.ids.map((id, i) => [id, hands[i] ?? []]));
  await db.query(
    `update public.games set hands = $1::jsonb, turn = $2::uuid, phase = 'playing', exchanges = '[]'
     where lobby_id = (select id from public.lobbies where code = $3)`,
    [JSON.stringify(handsJson), t.ids[turn], t.code],
  );
  await db.query(`update public.lobbies set status = 'playing' where code = $1`, [t.code]);
}

const ago = (db, t, seconds) =>
  db.query(
    `update public.games set turn_started = now() - make_interval(secs => $1)
     where lobby_id = (select id from public.lobbies where code = $2)`,
    [seconds, t.code],
  );

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.match(err.message, pattern);
    return true;
  });
}

describe('passe automatique', () => {
  test('seul l’hôte règle le délai ; désactivé par défaut', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    let s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.host });
    assert.equal(s.lobby.turn_limit, null);
    await rejects(rpc(db, 'set_turn_limit', { p_code: t.code, p_token: t.tokens[1], p_seconds: 30 }), /Seul le créateur/);
    await rejects(rpc(db, 'set_turn_limit', { p_code: t.code, p_token: t.host, p_seconds: 3 }), /Délai invalide/);
    s = await rpc(db, 'set_turn_limit', { p_code: t.code, p_token: t.host, p_seconds: 30 });
    assert.equal(s.lobby.turn_limit, 30);
    s = await rpc(db, 'set_turn_limit', { p_code: t.code, p_token: t.host, p_seconds: 0 });
    assert.equal(s.lobby.turn_limit, null);
  });

  test('délai dépassé : le joueur passe ; avant le délai, rien ne se passe', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rpc(db, 'set_turn_limit', { p_code: t.code, p_token: t.host, p_seconds: 30 });
    await forceRound(db, t, [['5S', '3S'], ['6H', '4S'], ['8D', '5H']], 0);
    let s = await rpc(db, 'play_cards', { p_code: t.code, p_token: t.tokens[0], p_cards: ['5S'] });
    assert.equal(s.game.turn, t.ids[1]);
    assert.ok(Math.abs(s.game.turn_started - s.now) < 2000);

    s = await rpc(db, 'claim_timeout', { p_code: t.code, p_token: t.tokens[2] });
    assert.equal(s.game.turn, t.ids[1], 'délai non écoulé');

    await ago(db, t, 31);
    s = await rpc(db, 'claim_timeout', { p_code: t.code, p_token: t.tokens[2] });
    assert.equal(s.game.turn, t.ids[2]);
    assert.deepEqual(s.game.trick.at(-1), { p: t.ids[1], pass: true });
    assert.deepEqual(s.game.events.at(-1), { seq: s.game.events.at(-1).seq, type: 'timeout', player: t.ids[1], action: 'pass' });
  });

  test('délai désactivé : jamais de passe automatique', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['5S', '3S'], ['6H', '4S'], ['8D', '5H']], 1);
    await ago(db, t, 3600);
    const s = await rpc(db, 'claim_timeout', { p_code: t.code, p_token: t.host });
    assert.equal(s.game.turn, t.ids[1]);
  });

  test('le joueur qui ouvre le pli joue sa plus petite carte', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rpc(db, 'set_turn_limit', { p_code: t.code, p_token: t.host, p_seconds: 15 });
    await forceRound(db, t, [['KS', '4C', '9H'], ['6H', '4S'], ['8D', '5H']], 0);
    await ago(db, t, 20);
    const s = await rpc(db, 'claim_timeout', { p_code: t.code, p_token: t.tokens[1] });
    assert.deepEqual(s.game.trick, [{ p: t.ids[0], c: ['4C'] }]);
    assert.equal(s.game.turn, t.ids[1]);
  });

  test('échange : les retardataires donnent leurs cartes les plus faibles ; le balayage serveur aussi', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
    await db.query(`update public.games set hands = (
      select jsonb_object_agg(key, case when key = $1 then '[]'::jsonb else value end) from jsonb_each(hands))
      where lobby_id = (select id from public.lobbies where code = $2)`, [t.ids[2], t.code]);
    // Fin de manche forcée : Ana présidente, Beto neutre, Carla trou.
    await db.query(`update public.players set role = case id when $1::uuid then 'president' when $2::uuid then 'neutral' else 'trou' end
      where lobby_id = (select id from public.lobbies where code = $3)`, [t.ids[0], t.ids[1], t.code]);
    await db.query(`update public.lobbies set status = 'finished' where code = $1`, [t.code]);
    await rpc(db, 'set_turn_limit', { p_code: t.code, p_token: t.host, p_seconds: 60 });
    let s = await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
    assert.equal(s.game.phase, 'exchange');
    const hand = [...s.hand];
    await ago(db, t, 61);
    await db.query('select private.sweep()');
    s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.host });
    assert.equal(s.game.phase, 'playing');
    const given = s.game.exchanges.find((e) => e.from === t.ids[0]).cards;
    const order = (c) => '3456789TJQKA2'.indexOf(c[0]) * 4 + 'CDHS'.indexOf(c[1]);
    assert.deepEqual(given, [...hand].sort((a, b) => order(a) - order(b)).slice(0, 2));
  });
});

describe('présence et notifications push', () => {
  async function subscribe(db, t, i) {
    return rpc(db, 'save_push', {
      p_code: t.code,
      p_token: t.tokens[i],
      p_endpoint: `https://fcm.googleapis.com/fcm/send/abc${i}`,
      p_p256dh: 'B'.repeat(87),
      p_auth: 'a'.repeat(22),
    });
  }
  const queue = async (db) => (await db.query('select player_id, title, body, url from private.push_queue order by id')).rows;

  test('le joueur absent dont c’est le tour est notifié, une seule fois par tour', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rpc(db, 'ping', { p_code: t.code, p_token: t.tokens[0], p_active: true });
    await rpc(db, 'ping', { p_code: t.code, p_token: t.tokens[2], p_active: true });
    const s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.host });
    assert.deepEqual(s.players.map((p) => p.online), [true, false, true]);

    await forceRound(db, t, [['5S', '3S'], ['6H', '4S'], ['8D', '5H']], 0);
    for (let i = 0; i < 3; i++) await subscribe(db, t, i);
    await rpc(db, 'play_cards', { p_code: t.code, p_token: t.tokens[0], p_cards: ['5S'] });
    let q = await queue(db);
    assert.equal(q.length, 1);
    assert.equal(q[0].player_id, t.ids[1]);
    assert.equal(q[0].url, `/t/${t.code}`);

    // Beto revient puis repart : déjà notifié pour ce tour.
    await rpc(db, 'ping', { p_code: t.code, p_token: t.tokens[1], p_active: true });
    await rpc(db, 'ping', { p_code: t.code, p_token: t.tokens[1], p_active: false });
    assert.equal((await queue(db)).length, 1);

    // Carla (en ligne) n'est pas notifiée ; elle passe son onglet en arrière-plan pendant son tour : notifiée.
    await rpc(db, 'ping', { p_code: t.code, p_token: t.tokens[1], p_active: true });
    await rpc(db, 'play_cards', { p_code: t.code, p_token: t.tokens[1], p_cards: ['6H'] });
    assert.equal((await queue(db)).length, 1);
    await rpc(db, 'ping', { p_code: t.code, p_token: t.tokens[2], p_active: false });
    q = await queue(db);
    assert.equal(q.length, 2);
    assert.equal(q[1].player_id, t.ids[2]);
  });

  test('sans abonnement, pas de notification ; abonnement invalide refusé', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['5S', '3S'], ['6H', '4S'], ['8D', '5H']], 0);
    await rpc(db, 'play_cards', { p_code: t.code, p_token: t.tokens[0], p_cards: ['5S'] });
    assert.equal((await queue(db)).length, 0);
    await rejects(
      rpc(db, 'save_push', { p_code: t.code, p_token: t.host, p_endpoint: 'http://evil', p_p256dh: 'x', p_auth: 'y' }),
      /invalide/,
    );
  });
});

describe('chat et emotes', () => {
  test('messages, historique, limite de débit, membres seulement', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    const m1 = await rpc(db, 'send_message', { p_code: t.code, p_token: t.host, p_body: '  ¡Hola! 🌶️  ' });
    assert.equal(m1.body, '¡Hola! 🌶️');
    assert.equal(m1.name, 'Ana');
    await rpc(db, 'send_message', { p_code: t.code, p_token: t.tokens[1], p_body: '@Ana à toi' });
    let msgs = await rpc(db, 'get_messages', { p_code: t.code, p_token: t.tokens[2], p_after: 0 });
    assert.deepEqual(msgs.map((m) => m.body), ['¡Hola! 🌶️', '@Ana à toi']);
    msgs = await rpc(db, 'get_messages', { p_code: t.code, p_token: t.tokens[2], p_after: m1.id });
    assert.equal(msgs.length, 1);
    const s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.host });
    assert.equal(s.lobby.chat_last, msgs[0].id);

    await rejects(rpc(db, 'send_message', { p_code: t.code, p_token: t.host, p_body: '   ' }), /vide/);
    await rejects(rpc(db, 'send_message', { p_code: t.code, p_token: t.host, p_body: 'x'.repeat(301) }), /trop long/);
    for (let i = 0; i < 3; i++) await rpc(db, 'send_message', { p_code: t.code, p_token: t.host, p_body: `m${i}` });
    await rejects(rpc(db, 'send_message', { p_code: t.code, p_token: t.host, p_body: 'spam' }), /Doucement/);
    await rejects(
      rpc(db, 'get_messages', { p_code: t.code, p_token: 'intrus-0123456789abcdef', p_after: 0 }),
      /pas partie/,
    );
    const sent = await db.query(`select count(*)::int as n from realtime.sent where event = 'chat'`);
    assert.equal(sent.rows[0].n, 5);
  });

  test('une @mention notifie le joueur absent abonné', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rpc(db, 'save_push', {
      p_code: t.code, p_token: t.tokens[2], p_endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      p_p256dh: 'B'.repeat(87), p_auth: 'a'.repeat(22),
    });
    await rpc(db, 'send_message', { p_code: t.code, p_token: t.host, p_body: 'Allez @carla, on t’attend' });
    const q = (await db.query('select player_id, title from private.push_queue')).rows;
    assert.deepEqual(q, [{ player_id: t.ids[2], title: 'Ana vous mentionne' }]);
  });

  test('emotes : liste fermée, une par seconde, visibles quelques secondes', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rejects(rpc(db, 'send_emote', { p_code: t.code, p_token: t.host, p_emote: '<b>' }), /inconnue/);
    let r = await rpc(db, 'send_emote', { p_code: t.code, p_token: t.host, p_emote: '🔥' });
    assert.equal(r.ok, true);
    r = await rpc(db, 'send_emote', { p_code: t.code, p_token: t.host, p_emote: '😂' });
    assert.equal(r.ok, false);
    let s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.tokens[1] });
    assert.equal(s.players[0].emote, '🔥');
    await db.query(`update public.players set emote_at = now() - interval '6 seconds'`);
    s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.tokens[1] });
    assert.equal(s.players[0].emote, null);
  });
});
