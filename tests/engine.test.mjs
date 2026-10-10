// Tests de la logique de jeu (fonctions SQL) sur un Postgres en mémoire.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rpc } from './db.mjs';

const RANKS = '3456789TJQKA2';
const rank = (c) => RANKS.indexOf(c[0]) + 1;
const NAMES = ['Ana', 'Beto', 'Carla', 'Diego', 'Elena', 'Fito', 'Gabi', 'Hugo', 'Ines'];

async function setupTable(db, n) {
  const tokens = NAMES.slice(0, n).map((name) => `token-${name}-0123456789abcdef`);
  const created = await rpc(db, 'create_lobby', { p_token: tokens[0], p_name: NAMES[0] });
  const code = created.lobby.code;
  for (let i = 1; i < n; i++) {
    await rpc(db, 'join_lobby', { p_code: code, p_token: tokens[i], p_name: NAMES[i] });
  }
  const state = await rpc(db, 'get_state', { p_code: code, p_token: tokens[0] });
  const ids = state.players.map((p) => p.id);
  const tokenOf = Object.fromEntries(ids.map((id, i) => [id, tokens[i]]));
  return { code, tokens, ids, tokenOf, host: tokens[0] };
}

const stateOf = (db, t, id) => rpc(db, 'get_state', { p_code: t.code, p_token: t.tokenOf[id] });
const play = (db, t, id, cards) => rpc(db, 'play_cards', { p_code: t.code, p_token: t.tokenOf[id], p_cards: cards });
const pass = (db, t, id) => rpc(db, 'pass_turn', { p_code: t.code, p_token: t.tokenOf[id] });

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.match(err.message, pattern);
    return true;
  });
}

// Démarre une manche puis impose les mains et le premier joueur.
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

function legalPlays(hand, trickSize, trickRank) {
  const byRank = new Map();
  for (const c of hand) {
    const r = rank(c);
    byRank.set(r, [...(byRank.get(r) ?? []), c]);
  }
  const plays = [];
  for (const [r, cards] of byRank) {
    if (trickSize === 0) {
      for (let k = 1; k <= cards.length; k++) plays.push(cards.slice(0, k));
    } else if (cards.length >= trickSize && r >= trickRank) {
      plays.push(cards.slice(0, trickSize));
    }
  }
  return plays;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Joue une manche complète avec des bots aléatoires en vérifiant les invariants.
async function playRandomRound(db, t) {
  let s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.host });
  const n = s.game.seats.length;

  if (s.game.phase === 'exchange') {
    // Le Trou-du-cul a donné ses meilleures cartes automatiquement.
    for (const ex of s.game.exchanges.filter((e) => e.done)) {
      const giverState = await stateOf(db, t, ex.from);
      const given = giverState.game.exchanges.find((e) => e.from === ex.from && e.done).cards;
      const minGiven = Math.min(...given.map(rank));
      assert.ok(giverState.hand.every((c) => rank(c) <= minGiven), 'le Trou-du-cul doit donner ses meilleures cartes');
    }
    for (const ex of s.game.exchanges.filter((e) => !e.done)) {
      const giver = await stateOf(db, t, ex.from);
      const cards = [...giver.hand].sort(() => Math.random() - 0.5).slice(0, ex.count);
      s = await rpc(db, 'give_cards', { p_code: t.code, p_token: t.tokenOf[ex.from], p_cards: cards });
    }
    assert.equal(s.game.phase, 'playing');
    assert.equal(s.lobby.status, 'playing');
  }

  let played = 0;
  for (let step = 0; step < 2000; step++) {
    if (s.game.phase === 'over') break;
    const turn = s.game.turn;
    const me = await stateOf(db, t, turn);
    assert.ok(me.hand.length > 0, 'le joueur dont c’est le tour a des cartes');

    // Invariant : 52 cartes au total, sans doublon.
    const all = [];
    for (const id of s.game.seats) all.push(...(await stateOf(db, t, id)).hand);
    assert.equal(all.length + played, 52);
    assert.equal(new Set(all).size, all.length);

    const plays = legalPlays(me.hand, me.game.trick_size, me.game.trick_rank);
    const canPass = me.game.trick_size > 0;
    if (plays.length === 0 || (canPass && Math.random() < 0.3)) {
      assert.ok(canPass, 'un joueur qui ouvre a toujours un coup');
      s = await pass(db, t, turn);
    } else {
      const cards = pick(plays);
      s = await play(db, t, turn, cards);
      played += cards.length;
    }
  }
  assert.equal(s.game.phase, 'over');
  assert.equal(s.lobby.status, 'finished');
  assert.equal(s.game.finished.length, n);
  assert.equal(new Set(s.game.finished).size, n);

  const roles = s.game.finished.map((id) => s.players.find((p) => p.id === id).role);
  const expected =
    n === 3
      ? ['president', 'neutral', 'trou']
      : ['president', 'vice_president', ...Array(n - 4).fill('neutral'), 'vice_trou', 'trou'];
  assert.deepEqual(roles, expected);
  return s;
}

describe('parties complètes aléatoires', () => {
  for (let n = 3; n <= 8; n++) {
    test(`${n} joueurs, 3 manches enchaînées`, async () => {
      const db = await createDb();
      const t = await setupTable(db, n);
      for (let round = 1; round <= 3; round++) {
        const started = await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
        assert.equal(started.lobby.round_no, round);
        if (round === 1) {
          assert.equal(started.game.phase, 'playing');
        } else {
          assert.equal(started.game.phase, 'exchange');
          // Le Trou-du-cul de la manche précédente commence.
          const trou = started.players.find((p) => p.role === 'trou');
          assert.equal(started.game.turn, trou.id);
          assert.equal(started.game.exchanges.length, n >= 4 ? 4 : 2);
        }
        // Distribution : écart d'au plus une carte (avant les échanges).
        const counts = started.players.map((p) => {
          const exchanged = started.game.exchanges.filter((e) => e.done);
          const received = exchanged.filter((e) => e.to === p.id).reduce((a, e) => a + e.count, 0);
          const given = exchanged.filter((e) => e.from === p.id).reduce((a, e) => a + e.count, 0);
          return p.cards - received + given;
        });
        assert.equal(counts.reduce((a, b) => a + b, 0), 52);
        assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
        await playRandomRound(db, t);
      }
      await db.close();
    });
  }
});

describe('règles', () => {
  test('coupe à 4 en simples : le joueur qui complète relance', async () => {
    const db = await createDb();
    const t = await setupTable(db, 4);
    await forceRound(db, t, [['7S', '3S'], ['7H', '4S'], ['7D', '5S'], ['7C', '6S']], 0);
    await play(db, t, t.ids[0], ['7S']);
    await play(db, t, t.ids[1], ['7H']);
    await play(db, t, t.ids[2], ['7D']);
    const s = await play(db, t, t.ids[3], ['7C']);
    assert.equal(s.game.trick_size, 0);
    assert.equal(s.game.turn, t.ids[3]);
    assert.equal(s.game.prev_winner, t.ids[3]);
    assert.equal(s.game.events.at(-1).type, 'cut');
  });

  test('coupe à 4 en paires', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['7S', '7H', '3S'], ['7D', '7C', '4S'], ['5S', '5H']], 0);
    await play(db, t, t.ids[0], ['7S', '7H']);
    const s = await play(db, t, t.ids[1], ['7D', '7C']);
    assert.equal(s.game.events.at(-1).type, 'cut');
    assert.equal(s.game.turn, t.ids[1]);
    assert.equal(s.game.trick_size, 0);
  });

  test('un carré en ouverture coupe immédiatement et le joueur rejoue', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['9S', '9H', '9D', '9C', '3S'], ['4S'], ['5S']], 0);
    const s = await play(db, t, t.ids[0], ['9S', '9H', '9D', '9C']);
    assert.equal(s.game.events.at(-1).type, 'cut');
    assert.equal(s.game.turn, t.ids[0]);
    assert.equal(s.game.trick_size, 0);
  });

  test('le 2 ferme le pli', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['9S', '3S'], ['2H', '4S'], ['5S', 'AS']], 0);
    await play(db, t, t.ids[0], ['9S']);
    const s = await play(db, t, t.ids[1], ['2H']);
    assert.equal(s.game.events.at(-1).type, 'two');
    assert.equal(s.game.turn, t.ids[1]);
    assert.equal(s.game.trick_size, 0);
  });

  test('format du pli, valeur égale ou supérieure, tour de jeu', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['8S', '8H', '3S'], ['8D', '8C', '4S', '6H', 'KS'], ['5S', 'AS']], 0);
    await rejects(play(db, t, t.ids[1], ['4S']), /pas votre tour/);
    await rejects(pass(db, t, t.ids[0]), /ouvrez le pli/);
    await rejects(play(db, t, t.ids[0], ['8S', '3S']), /même valeur/);
    await rejects(play(db, t, t.ids[0], ['KS']), /pas ces cartes/);
    await play(db, t, t.ids[0], ['8S']);
    await rejects(play(db, t, t.ids[1], ['8D', '8C']), /cartes simples/);
    await rejects(play(db, t, t.ids[1], ['6H']), /égale ou supérieure/);
    const s = await play(db, t, t.ids[1], ['8D']); // valeur égale autorisée
    assert.equal(s.game.turn, t.ids[2]);
    assert.equal(s.game.trick_rank, rank('8D'));
  });

  test('tout le monde passe : le dernier à avoir joué relance ; passer puis revenir est permis', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['5S', '9S', '3S'], ['6S', '4S'], ['7S', 'TS']], 0);
    await play(db, t, t.ids[0], ['5S']);
    await pass(db, t, t.ids[1]);
    await play(db, t, t.ids[2], ['7S']);
    await play(db, t, t.ids[0], ['9S']); // A a joué, B a passé, C relance : A revient
    await pass(db, t, t.ids[1]);
    const s = await pass(db, t, t.ids[2]);
    assert.equal(s.game.events.at(-1).type, 'won');
    assert.equal(s.game.turn, t.ids[0]);
    assert.equal(s.game.trick_size, 0);
    assert.deepEqual(
      s.game.prev_trick.filter((x) => x.pass).map((x) => x.p),
      [t.ids[1], t.ids[1], t.ids[2]],
    );
  });

  test('un joueur qui sort : le pli continue, puis le suivant relance', async () => {
    const db = await createDb();
    const t = await setupTable(db, 4);
    await forceRound(db, t, [['KS'], ['3H', '4H'], ['3D', '4D'], ['3C', '5C']], 0);
    let s = await play(db, t, t.ids[0], ['KS']);
    assert.deepEqual(s.game.finished, [t.ids[0]]);
    assert.equal(s.game.turn, t.ids[1]);
    await pass(db, t, t.ids[1]);
    await pass(db, t, t.ids[2]);
    s = await pass(db, t, t.ids[3]);
    assert.equal(s.game.turn, t.ids[1], 'le joueur après celui qui est sorti relance');
    assert.equal(s.game.trick_size, 0);
  });

  test('finir sur un 2 est autorisé ; fin de manche et rôles à 3 joueurs', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await forceRound(db, t, [['2S'], ['3H', '4H'], ['2D', '5D']], 0);
    let s = await play(db, t, t.ids[0], ['2S']);
    assert.equal(s.game.turn, t.ids[1]);
    await play(db, t, t.ids[1], ['3H']);
    s = await play(db, t, t.ids[2], ['2D']);
    assert.equal(s.game.turn, t.ids[2]);
    s = await play(db, t, t.ids[2], ['5D']);
    assert.equal(s.game.phase, 'over');
    assert.deepEqual(s.game.finished, [t.ids[0], t.ids[2], t.ids[1]]);
    assert.deepEqual(
      s.players.map((p) => p.role),
      ['president', 'trou', 'neutral'],
    );
  });

  test('échanges : le Président et le Vice rendent les cartes de leur choix', async () => {
    const db = await createDb();
    const t = await setupTable(db, 4);
    await db.query(
      `update public.players set role = case seat when 1 then 'president' when 2 then 'vice_president'
       when 3 then 'vice_trou' else 'trou' end`,
    );
    let s = await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
    assert.equal(s.game.phase, 'exchange');
    assert.equal(s.game.turn, t.ids[3]);
    // Le Président voit l'échange qui le concerne, pas celui des Vices.
    const visible = s.game.exchanges.filter((e) => 'cards' in e);
    assert.ok(visible.every((e) => e.from === t.ids[0] || e.to === t.ids[0]));
    assert.equal(s.hand.length, 13 + 2);

    await rejects(play(db, t, t.ids[3], [s.hand[0]]), /Aucune manche en cours/);
    await rejects(
      rpc(db, 'give_cards', { p_code: t.code, p_token: t.tokens[0], p_cards: [s.hand[0]] }),
      /exactement 2/,
    );
    await rejects(rpc(db, 'give_cards', { p_code: t.code, p_token: t.tokens[2], p_cards: [] }), /pas de cartes à donner/);

    const gift = s.hand.slice(0, 2);
    s = await rpc(db, 'give_cards', { p_code: t.code, p_token: t.tokens[0], p_cards: gift });
    assert.equal(s.game.phase, 'exchange');
    const trou = await stateOf(db, t, t.ids[3]);
    assert.ok(gift.every((c) => trou.hand.includes(c)));
    assert.equal(trou.hand.length, 13);

    const vp = await stateOf(db, t, t.ids[1]);
    s = await rpc(db, 'give_cards', { p_code: t.code, p_token: t.tokens[1], p_cards: [vp.hand[0]] });
    assert.equal(s.game.phase, 'playing');
    assert.equal(s.lobby.status, 'playing');
    assert.deepEqual(s.players.map((p) => p.cards), [13, 13, 13, 13]);
  });
});

describe('table et joueurs', () => {
  test('rejoindre : nom unique, 8 joueurs max, pas pendant une manche, reconnexion', async () => {
    const db = await createDb();
    const t = await setupTable(db, 8);
    await rejects(
      rpc(db, 'join_lobby', { p_code: t.code, p_token: 'another-token-0123456789', p_name: 'Zoé' }),
      /complète/,
    );
    await rpc(db, 'leave_lobby', { p_code: t.code, p_token: t.tokens[7] });
    await rejects(
      rpc(db, 'join_lobby', { p_code: t.code, p_token: 'another-token-0123456789', p_name: ' ana ' }),
      /déjà pris/,
    );
    // Code en minuscules accepté, même navigateur = même joueur.
    const again = await rpc(db, 'join_lobby', { p_code: t.code.toLowerCase(), p_token: t.tokens[1], p_name: 'X' });
    assert.equal(again.me, t.ids[1]);

    await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
    await rejects(
      rpc(db, 'join_lobby', { p_code: t.code, p_token: 'another-token-0123456789', p_name: 'Zoé' }),
      /manche est en cours/,
    );
    await rejects(rpc(db, 'get_state', { p_code: 'ZZZZZ', p_token: t.host }), /n'existe pas/);
  });

  test('les mains des autres ne sont jamais visibles', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
    const outsider = await rpc(db, 'get_state', { p_code: t.code, p_token: 'outsider-token-0123456789' });
    assert.equal(outsider.me, null);
    assert.equal(outsider.hand, null);
    const json = JSON.stringify(await stateOf(db, t, t.ids[0]));
    const other = await stateOf(db, t, t.ids[1]);
    // Aucune carte de la main de B n'apparaît dans l'état de A.
    assert.ok(other.hand.every((c) => !json.includes(`"${c}"`)));
  });

  test('seul l’hôte lance ; 3 joueurs minimum ; départ en cours de manche', async () => {
    const db = await createDb();
    const t = await setupTable(db, 3);
    await rejects(rpc(db, 'start_round', { p_code: t.code, p_token: t.tokens[1] }), /Seul le créateur/);
    await rpc(db, 'start_round', { p_code: t.code, p_token: t.host });
    await rpc(db, 'leave_lobby', { p_code: t.code, p_token: t.tokens[2] });
    const s = await rpc(db, 'get_state', { p_code: t.code, p_token: t.host });
    assert.equal(s.lobby.status, 'waiting');
    assert.equal(s.game, null);
    assert.match(s.lobby.notice, /Carla a quitté/);
    await rejects(rpc(db, 'start_round', { p_code: t.code, p_token: t.host }), /au moins 3/);
  });

  test('l’hôte qui part transmet la table ; exclusion ; annulation', async () => {
    const db = await createDb();
    const t = await setupTable(db, 4);
    await rpc(db, 'leave_lobby', { p_code: t.code, p_token: t.host });
    let s = await stateOf(db, t, t.ids[1]);
    assert.equal(s.lobby.host_id, t.ids[1]);
    await rejects(
      rpc(db, 'kick_player', { p_code: t.code, p_token: t.tokens[2], p_player: t.ids[3] }),
      /Seul le créateur/,
    );
    await rpc(db, 'join_lobby', { p_code: t.code, p_token: t.host, p_name: 'Ana' });
    await rpc(db, 'start_round', { p_code: t.code, p_token: t.tokens[1] });
    s = await rpc(db, 'cancel_round', { p_code: t.code, p_token: t.tokens[1] });
    assert.equal(s.lobby.status, 'waiting');
    s = await rpc(db, 'kick_player', { p_code: t.code, p_token: t.tokens[1], p_player: t.ids[3] });
    assert.equal(s.players.length, 3);
    // Chaque modification notifie le canal temps réel de la table.
    const sent = await db.query(`select distinct topic, private from realtime.sent`);
    assert.deepEqual(sent.rows, [{ topic: `lobby:${s.lobby.id}`, private: false }]);
  });
});
