// Portage des scénarios de tests/engine.test.mjs et tests/social.test.mjs (version SQL) :
// ils servent de spécification de parité.

import { describe, expect, test } from 'bun:test';
import { formatCards, parseCard, rankOf, type Card } from './cards';
import {
  autoMove,
  forcedRank,
  giveCards,
  isTimedOut,
  passTurn,
  playCards,
  rolesFromFinish,
  roundRoles,
  startRound,
  type MoveResult,
} from './engine';
import { cardsOf, createHands, handSize, setHand } from './hand';
import { legalPlays } from './hints';
import { seededRng, type Rng } from './random';
import type { GameState, Role } from './state';
import { gameView, handView } from './view';

const NOW = 1_000_000;
const cards = (...texts: string[]): Card[] => texts.map(parseCard);
const hand = (g: GameState, seat: number) => handView(g, seat);

/** Manche en cours avec des mains imposées. */
function forceRound(hands: string[][], turn: number): GameState {
  const n = hands.length;
  const h = createHands(n);
  hands.forEach((cs, s) => setHand(h, s, cards(...cs)));
  return {
    n,
    roundNo: 1,
    phase: 'playing',
    hands: h,
    turn,
    turnStartedAt: NOW,
    trick: [],
    trickSize: 0,
    trickRank: 0,
    lastPlayer: -1,
    passes: 0,
    prevTrick: [],
    prevWinner: -1,
    finished: [],
    exchanges: [],
    events: [],
    eventSeq: 0,
  };
}

function ok(result: MoveResult) {
  if (result.isErr()) throw new Error(`coup refusé : ${result.error.message}`);
  return result.value;
}

function rejects(result: MoveResult, pattern: RegExp) {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) expect(result.error.message).toMatch(pattern);
}

const play = (g: GameState, seat: number, ...cs: string[]) => playCards(g, seat, cards(...cs), NOW);
const pass = (g: GameState, seat: number) => passTurn(g, seat, NOW);
const lastEvent = (g: GameState) => g.events.at(-1)!;

function newRound(players: number, roles: (Role | null)[], rng: Rng, roundNo = 1) {
  const r = startRound({ players, roundNo, roles, rng, now: NOW });
  if (r.isErr()) throw new Error(r.error.message);
  return r.value.state;
}

// Joue une manche complète avec des bots aléatoires en vérifiant les invariants.
function playRandomRound(g: GameState, rng: Rng) {
  if (g.phase === 'exchange') {
    for (const ex of g.exchanges.filter((e) => e.done)) {
      const minGiven = Math.min(...ex.cards!.map(rankOf));
      expect(cardsOf(g.hands, ex.from).every((c) => rankOf(c) <= minGiven)).toBe(true);
    }
    for (const ex of g.exchanges.filter((e) => !e.done)) {
      const own = cardsOf(g.hands, ex.from);
      const gift: Card[] = [];
      while (gift.length < ex.count) {
        const c = own.splice(rng(own.length), 1)[0]!;
        gift.push(c);
      }
      ok(giveCards(g, ex.from, gift, NOW));
    }
    expect(g.phase as string).toBe('playing');
  }

  let played = 0;
  for (let step = 0; step < 2000 && g.phase !== 'over'; step++) {
    const seat = g.turn;
    const own = cardsOf(g.hands, seat);
    expect(own.length).toBeGreaterThan(0);

    // Invariant : 52 cartes au total, sans doublon.
    const all = Array.from({ length: g.n }, (_, s) => cardsOf(g.hands, s)).flat();
    expect(all.length + played).toBe(52);
    expect(new Set(all).size).toBe(all.length);

    const plays = legalPlays(own, g.trickSize, g.trickRank, forcedRank(g.trick, g.trickSize));
    const canPass = g.trickSize > 0;
    if (plays.length === 0 || (canPass && rng(10) < 3)) {
      expect(canPass).toBe(true);
      ok(passTurn(g, seat, NOW));
    } else {
      const choice = plays[rng(plays.length)]!;
      ok(playCards(g, seat, choice, NOW));
      played += choice.length;
    }
  }
  expect(g.phase).toBe('over');
  expect(g.finished.length).toBe(g.n);
  expect(new Set(g.finished).size).toBe(g.n);

  const roles = roundRoles(g)!;
  const inOrder = g.finished.map((s) => roles[s]);
  const expected =
    g.n === 3
      ? ['president', 'neutral', 'trou']
      : ['president', 'vice_president', ...Array(g.n - 4).fill('neutral'), 'vice_trou', 'trou'];
  expect(inOrder).toEqual(expected);
  return roles;
}

describe('parties complètes aléatoires', () => {
  for (let n = 3; n <= 8; n++) {
    test(`${n} joueurs, 3 manches enchaînées`, () => {
      const rng = seededRng(n * 7919);
      let roles: (Role | null)[] = Array(n).fill(null);
      for (let round = 1; round <= 3; round++) {
        const g = newRound(n, roles, rng, round);
        expect(g.roundNo).toBe(round);
        if (round === 1) {
          expect(g.phase).toBe('playing');
          expect(hand(g, g.turn)).toContain('QH');
          expect(g.events[0]).toMatchObject({ type: 'round_start', reason: 'queen' });
        } else {
          expect(g.phase).toBe('exchange');
          expect(g.turn).toBe(roles.indexOf('trou'));
          expect(g.exchanges.length).toBe(n >= 4 ? 4 : 2);
        }
        // Distribution : écart d'au plus une carte (avant les échanges).
        const counts = Array.from({ length: n }, (_, s) => {
          const done = g.exchanges.filter((e) => e.done);
          const received = done.filter((e) => e.to === s).reduce((a, e) => a + e.count, 0);
          const given = done.filter((e) => e.from === s).reduce((a, e) => a + e.count, 0);
          return handSize(g.hands, s) - received + given;
        });
        expect(counts.reduce((a, b) => a + b, 0)).toBe(52);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        roles = playRandomRound(g, rng);
      }
    });
  }

  test('1 000 manches aléatoires sans violation des invariants', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 1000; i++) {
      const n = 3 + rng(6);
      playRandomRound(newRound(n, Array(n).fill(null), rng), rng);
    }
  });
});

describe('règles', () => {
  test('coupe à 4 en simples : le joueur qui complète relance', () => {
    const g = forceRound(
      [
        ['7S', '3S'],
        ['7H', '4S'],
        ['7D', '5S'],
        ['7C', '6S'],
      ],
      0,
    );
    ok(play(g, 0, '7S'));
    ok(play(g, 1, '7H'));
    ok(play(g, 2, '7D'));
    ok(play(g, 3, '7C'));
    expect(g.trickSize).toBe(0);
    expect(g.turn).toBe(3);
    expect(g.prevWinner).toBe(3);
    expect(lastEvent(g).type).toBe('cut');
  });

  test('coupe à 4 en paires', () => {
    const g = forceRound(
      [
        ['7S', '7H', '3S'],
        ['7D', '7C', '4S'],
        ['5S', '5H'],
      ],
      0,
    );
    ok(play(g, 0, '7S', '7H'));
    ok(play(g, 1, '7D', '7C'));
    expect(lastEvent(g).type).toBe('cut');
    expect(g.turn).toBe(1);
    expect(g.trickSize).toBe(0);
  });

  test('un carré en ouverture coupe immédiatement et le joueur rejoue', () => {
    const g = forceRound([['9S', '9H', '9D', '9C', '3S'], ['4S'], ['5S']], 0);
    ok(play(g, 0, '9S', '9H', '9D', '9C'));
    expect(lastEvent(g).type).toBe('cut');
    expect(g.turn).toBe(0);
    expect(g.trickSize).toBe(0);
  });

  test('le 2 ferme le pli', () => {
    const g = forceRound(
      [
        ['9S', '3S'],
        ['2H', '4S'],
        ['5S', 'AS'],
      ],
      0,
    );
    ok(play(g, 0, '9S'));
    ok(play(g, 1, '2H'));
    expect(lastEvent(g).type).toBe('two');
    expect(g.turn).toBe(1);
    expect(g.trickSize).toBe(0);
  });

  test('format du pli, valeur égale ou supérieure, tour de jeu', () => {
    const g = forceRound(
      [
        ['8S', '8H', '3S'],
        ['8D', '8C', '4S', '6H', 'KS'],
        ['5S', 'AS'],
      ],
      0,
    );
    rejects(play(g, 1, '4S'), /pas votre tour/);
    rejects(pass(g, 0), /ouvrez le pli/);
    rejects(play(g, 0, '8S', '3S'), /même valeur/);
    rejects(play(g, 0, 'KS'), /pas ces cartes/);
    rejects(play(g, 0, '8S', '8S'), /pas ces cartes/);
    rejects(playCards(g, 0, [], NOW), /entre 1 et 4/);
    rejects(playCards(g, 0, [99], NOW), /pas ces cartes/);
    ok(play(g, 0, '8S'));
    rejects(play(g, 1, '8D', '8C'), /cartes simples/);
    rejects(play(g, 1, '6H'), /égale ou supérieure/);
    ok(play(g, 1, '8D')); // valeur égale autorisée
    expect(g.turn).toBe(2);
    expect(g.trickRank).toBe(rankOf(parseCard('8D')));
  });

  test('un coup refusé ne modifie pas l’état', () => {
    const g = forceRound([['8S', '8H', '3S'], ['4S'], ['5S']], 0);
    const before = JSON.stringify(gameView(g, 0)) + hand(g, 0).join();
    rejects(play(g, 0, '8S', '3S'), /même valeur/);
    expect(JSON.stringify(gameView(g, 0)) + hand(g, 0).join()).toBe(before);
  });

  test('tout le monde passe : le dernier à avoir joué relance ; passer puis revenir est permis', () => {
    const g = forceRound(
      [
        ['5S', '9S', '3S'],
        ['6S', '4S'],
        ['7S', 'TS'],
      ],
      0,
    );
    ok(play(g, 0, '5S'));
    ok(pass(g, 1));
    ok(play(g, 2, '7S'));
    ok(play(g, 0, '9S'));
    ok(pass(g, 1));
    ok(pass(g, 2));
    expect(lastEvent(g).type).toBe('won');
    expect(g.turn).toBe(0);
    expect(g.trickSize).toBe(0);
    expect(g.prevTrick.filter((x) => x.c === null).map((x) => x.p)).toEqual([1, 1, 2]);
  });

  test('un joueur qui sort : le pli continue, puis le suivant relance', () => {
    const g = forceRound([['KS'], ['3H', '4H'], ['3D', '4D'], ['3C', '5C']], 0);
    ok(play(g, 0, 'KS'));
    expect(g.finished).toEqual([0]);
    expect(g.turn).toBe(1);
    ok(pass(g, 1));
    ok(pass(g, 2));
    ok(pass(g, 3));
    expect(g.turn).toBe(1);
    expect(g.trickSize).toBe(0);
  });

  test('finir sur un 2 est autorisé ; fin de manche et rôles à 3 joueurs', () => {
    const g = forceRound([['2S'], ['3H', '4H'], ['2D', '5D']], 0);
    ok(play(g, 0, '2S'));
    expect(g.turn).toBe(1);
    ok(play(g, 1, '3H'));
    ok(play(g, 2, '2D'));
    expect(g.turn).toBe(2);
    ok(play(g, 2, '5D'));
    expect(g.phase).toBe('over');
    expect(g.finished).toEqual([0, 2, 1]);
    expect(roundRoles(g)).toEqual(['president', 'trou', 'neutral']);
    expect(lastEvent(g).type).toBe('round_over');
  });

  test('carte ou rien : après deux simples de même valeur, le suivant doit suivre cette valeur ou passer', () => {
    const g = forceRound(
      [
        ['7S', '3S'],
        ['7H', '4S'],
        ['9D', '7D', '5S'],
        ['KC', '6S'],
      ],
      0,
    );
    ok(play(g, 0, '7S'));
    ok(play(g, 1, '7H'));
    rejects(play(g, 2, '9D'), /7 ou rien/);
    ok(pass(g, 2));
    expect(g.turn).toBe(3);
  });

  test('carte ou rien, exemple 1 : J1 7, J2 7, J3 passe → J1 peut jouer 7 ou plus', () => {
    const g = forceRound(
      [
        ['7S', '9C', '3S'],
        ['7H', 'JD', '4S'],
        ['7D', '5S'],
      ],
      0,
    );
    ok(play(g, 0, '7S'));
    ok(play(g, 1, '7H'));
    ok(pass(g, 2));
    expect(g.turn).toBe(0);
    ok(play(g, 0, '9C'));
    expect(g.trickRank).toBe(rankOf(parseCard('9C')));
    expect(g.turn).toBe(1);
    ok(play(g, 1, 'JD'));
    expect(g.turn).toBe(2);
  });

  test('carte ou rien, exemple 2 : J1 joue le 4e 7 et remporte le pli (coupe à 4)', () => {
    const g = forceRound(
      [
        ['7S', '7C', '9C', '3S'],
        ['7H', 'JD', '4S'],
        ['7D', '5S'],
      ],
      0,
    );
    ok(play(g, 0, '7S'));
    ok(play(g, 1, '7H'));
    ok(play(g, 2, '7D'));
    rejects(play(g, 0, '9C'), /7 ou rien/);
    ok(play(g, 0, '7C'));
    expect(lastEvent(g).type).toBe('cut');
    expect(g.turn).toBe(0);
    expect(g.trickSize).toBe(0);
  });

  test('carte ou rien : la contrainte disparaît quand les deux dernières cartes diffèrent', () => {
    const g = forceRound(
      [
        ['5S', '8S', '3S'],
        ['6H', '4S'],
        ['8D', '5H'],
      ],
      0,
    );
    ok(play(g, 0, '5S'));
    ok(play(g, 1, '6H'));
    ok(play(g, 2, '8D'));
    ok(play(g, 0, '8S'));
    rejects(play(g, 1, '4S'), /8 ou rien|égale ou supérieure/);
    expect(g.turn).toBe(1);
  });

  test('carte ou rien ne s’applique pas aux paires', () => {
    const g = forceRound(
      [
        ['6S', '6H', '3S'],
        ['6D', '6C', '4S'],
        ['9D', '9H', '5S'],
      ],
      0,
    );
    ok(play(g, 0, '6S', '6H'));
    ok(play(g, 1, '6D', '6C'));
    expect(lastEvent(g).type).toBe('cut');
  });

  test('libellés de « carte ou rien » pour les figures', () => {
    const g = forceRound(
      [
        ['QS', '3S'],
        ['QH', '4S'],
        ['KD', '5S'],
      ],
      0,
    );
    ok(play(g, 0, 'QS'));
    ok(play(g, 1, 'QH'));
    rejects(play(g, 2, 'KD'), /^Dame ou rien/);
  });

  test('la Dame de cœur commence la première manche', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) {
      const g = newRound(4, [null, null, null, null], rng);
      expect(hand(g, g.turn)).toContain('QH');
    }
  });

  test('3 à 8 joueurs', () => {
    expect(startRound({ players: 2, roundNo: 1, roles: [], rng: seededRng(1), now: NOW }).isErr()).toBe(true);
    expect(startRound({ players: 9, roundNo: 1, roles: [], rng: seededRng(1), now: NOW }).isErr()).toBe(true);
  });

  test('échanges : le Président et le Vice rendent les cartes de leur choix', () => {
    const g = newRound(4, ['president', 'vice_president', 'vice_trou', 'trou'], seededRng(3), 2);
    expect(g.phase).toBe('exchange');
    expect(g.turn).toBe(3);
    // Le Président voit l'échange qui le concerne, pas celui des Vices.
    const visible = gameView(g, 0).exchanges.filter((e) => 'cards' in e);
    expect(visible.every((e) => e.from === 0 || e.to === 0)).toBe(true);
    expect(handSize(g.hands, 0)).toBe(13 + 2);

    rejects(playCards(g, 3, cardsOf(g.hands, 3).slice(0, 1), NOW), /Aucune manche en cours/);
    rejects(giveCards(g, 0, cardsOf(g.hands, 0).slice(0, 1), NOW), /exactement 2/);
    rejects(giveCards(g, 2, [], NOW), /pas de cartes à donner/);

    const gift = cardsOf(g.hands, 0).slice(0, 2);
    ok(giveCards(g, 0, gift, NOW));
    expect(g.phase).toBe('exchange');
    expect(gift.every((c) => cardsOf(g.hands, 3).includes(c))).toBe(true);
    expect(handSize(g.hands, 3)).toBe(13);

    ok(giveCards(g, 1, cardsOf(g.hands, 1).slice(0, 1), NOW));
    expect(g.phase).toBe('playing');
    expect(lastEvent(g)).toMatchObject({ type: 'exchange_done', player: 3 });
    expect([0, 1, 2, 3].map((s) => handSize(g.hands, s))).toEqual([13, 13, 13, 13]);
  });

  test('rôles selon l’ordre de sortie', () => {
    expect(rolesFromFinish([2, 0, 1], 3)).toEqual(['neutral', 'trou', 'president']);
    expect(rolesFromFinish([4, 3, 2, 1, 0], 5)).toEqual([
      'trou',
      'vice_trou',
      'neutral',
      'vice_president',
      'president',
    ]);
  });
});

describe('passe automatique', () => {
  test('délai dépassé : le joueur passe ; avant le délai, rien ne se passe', () => {
    const g = forceRound(
      [
        ['5S', '3S'],
        ['6H', '4S'],
        ['8D', '5H'],
      ],
      0,
    );
    ok(playCards(g, 0, cards('5S'), NOW));
    expect(g.turnStartedAt).toBe(NOW);
    expect(isTimedOut(g, 30, NOW + 29_000)).toBe(false);
    expect(isTimedOut(g, 30, NOW + 31_000)).toBe(true);
    const events = autoMove(g, NOW + 31_000);
    expect(g.turn).toBe(2);
    expect(g.trick.at(-1)).toEqual({ p: 1, c: null });
    expect(events[0]).toMatchObject({ type: 'timeout', player: 1, action: 'pass' });
    expect(g.turnStartedAt).toBe(NOW + 31_000);
  });

  test('délai désactivé : jamais de passe automatique', () => {
    const g = forceRound(
      [
        ['5S', '3S'],
        ['6H', '4S'],
        ['8D', '5H'],
      ],
      1,
    );
    expect(isTimedOut(g, null, NOW + 3_600_000)).toBe(false);
  });

  test('le joueur qui ouvre le pli joue sa plus petite carte', () => {
    const g = forceRound(
      [
        ['KS', '4C', '9H'],
        ['6H', '4S'],
        ['8D', '5H'],
      ],
      0,
    );
    autoMove(g, NOW + 20_000);
    expect(gameView(g, 0).trick).toEqual([{ p: 0, c: ['4C'] }]);
    expect(g.turn).toBe(1);
  });

  test('échange : les retardataires donnent leurs cartes les plus faibles', () => {
    const g = newRound(3, ['president', 'neutral', 'trou'], seededRng(11), 2);
    expect(g.phase).toBe('exchange');
    const before = cardsOf(g.hands, 0);
    const events = autoMove(g, NOW + 61_000);
    expect(g.phase).toBe('playing');
    expect(g.exchanges.find((e) => e.from === 0)!.cards).toEqual(before.slice(0, 2));
    expect(events.map((e) => e.type)).toEqual(['timeout', 'exchange_done']);
  });
});

describe('vues', () => {
  test('les mains des autres ne sont jamais visibles', () => {
    const g = newRound(3, [null, null, null], seededRng(5));
    const json = JSON.stringify(gameView(g, 0));
    for (const c of hand(g, 1)) expect(json.includes(`"${c}"`)).toBe(false);
    expect(gameView(g, 0).counts).toEqual([0, 1, 2].map((s) => handSize(g.hands, s)));
  });

  test('cartes : texte ↔ entier', () => {
    for (let c = 0; c < 52; c++) expect(parseCard(formatCards([c])[0]!)).toBe(c);
    expect(parseCard('XX')).toBe(-1);
    expect(parseCard('QHH')).toBe(-1);
  });
});
