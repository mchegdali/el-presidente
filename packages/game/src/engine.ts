// Règles du Président « de la casa ». Fonctions sans entrée/sortie : l'appelant fournit
// l'heure et le hasard, et persiste l'état.
//
// Les coups (`playCards`, `passTurn`, `giveCards`, `autoMove`) valident tout avant de
// toucher à l'état : en cas d'erreur, l'état est inchangé ; en cas de succès, il est
// modifié sur place (pas de copie par coup) et les événements produits sont renvoyés.

import { Result } from 'better-result';
import { DECK_SIZE, QUEEN_OF_HEARTS, TWO, rankLabel, rankOf, type Card } from './cards';
import { type GameRuleError, ruleError } from './errors';
import {
  addCard,
  cardsOf,
  createHands,
  handSize,
  hasCard,
  highestCards,
  lowestCards,
  removeCard,
  type Hands,
} from './hand';
import { shuffledDeck, type Rng } from './random';
import { MAX_EVENTS, type GameEvent, type GameState, type NewGameEvent, type Role, type TrickEntry } from './state';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export type MoveResult = Result<GameEvent[], GameRuleError>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushEvent(g: GameState, out: GameEvent[], ev: NewGameEvent): void {
  g.eventSeq += 1;
  const event = { ...ev, seq: g.eventSeq } as GameEvent;
  g.events.push(event);
  if (g.events.length > MAX_EVENTS) g.events.splice(0, g.events.length - MAX_EVENTS);
  out.push(event);
}

function activeCount(g: GameState): number {
  let count = 0;
  for (let s = 0; s < g.n; s++) if (handSize(g.hands, s) > 0) count++;
  return count;
}

/** Prochain joueur qui a encore des cartes, après `from` dans l'ordre du tour. */
function nextActive(g: GameState, from: number): number {
  for (let i = 1; i <= g.n; i++) {
    const seat = (from + i) % g.n;
    if (handSize(g.hands, seat) > 0) return seat;
  }
  return -1;
}

/** Vrai si `cards` sont distinctes et toutes dans la main du joueur. */
function ownsAll(hands: Hands, seat: number, cards: readonly Card[]): boolean {
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!;
    if (!Number.isInteger(c) || c < 0 || c >= DECK_SIZE || !hasCard(hands, seat, c)) return false;
    for (let j = 0; j < i; j++) if (cards[j] === c) return false;
  }
  return true;
}

const sorted = (cards: readonly Card[]): Card[] => [...cards].sort((a, b) => a - b);

/** Ferme le pli : le gagnant relance, ou le joueur suivant s'il n'a plus de cartes. */
function closeTrick(g: GameState, winner: number): void {
  g.prevTrick = g.trick;
  g.prevWinner = winner;
  g.trick = [];
  g.trickSize = 0;
  g.trickRank = 0;
  g.passes = 0;
  g.lastPlayer = -1;
  g.turn = handSize(g.hands, winner) > 0 ? winner : nextActive(g, winner);
}

/** Rôle de chaque siège selon l'ordre de sortie. Sans Vices à 3 joueurs. */
export function rolesFromFinish(finished: readonly number[], n: number): Role[] {
  const roles: Role[] = Array.from({ length: n }, () => 'neutral');
  finished.forEach((seat, i) => {
    const pos = i + 1;
    roles[seat] =
      pos === 1
        ? 'president'
        : pos === n
          ? 'trou'
          : n >= 4 && pos === 2
            ? 'vice_president'
            : n >= 4 && pos === n - 1
              ? 'vice_trou'
              : 'neutral';
  });
  return roles;
}

/** Fin de manche : le dernier joueur avec des cartes termine Trou-du-cul. */
function finishRound(g: GameState, out: GameEvent[]): void {
  for (let s = 0; s < g.n; s++) {
    if (handSize(g.hands, s) > 0 && !g.finished.includes(s)) g.finished.push(s);
  }
  g.phase = 'over';
  g.turn = -1;
  if (g.trick.length > 0) {
    g.prevTrick = g.trick;
    g.prevWinner = g.lastPlayer;
  }
  g.trick = [];
  g.trickSize = 0;
  g.trickRank = 0;
  g.passes = 0;
  g.lastPlayer = -1;
  pushEvent(g, out, { type: 'round_over' });
}

/**
 * Carte ou rien : en simples, si les deux dernières actions du pli sont deux cartes de
 * même valeur, on ne peut suivre qu'avec cette valeur (ou passer). Une passe lève la
 * contrainte. Renvoie la valeur imposée, ou 0.
 */
export function forcedRank(trick: readonly TrickEntry[], trickSize: number): number {
  if (trickSize !== 1 || trick.length < 2) return 0;
  const prev = trick[trick.length - 2]!.c;
  const last = trick[trick.length - 1]!.c;
  if (prev === null || last === null) return 0;
  const r = rankOf(last[0]!);
  return rankOf(prev[0]!) === r ? r : 0;
}

/** Nombre de cartes de la valeur `rank` posées dans le pli (coupe à 4). */
function rankCountInTrick(trick: readonly TrickEntry[], rank: number): number {
  let count = 0;
  for (const entry of trick) {
    if (entry.c === null) continue;
    for (const c of entry.c) if (rankOf(c) === rank) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Manche
// ---------------------------------------------------------------------------

export interface StartRoundInput {
  /** Nombre de joueurs, dans l'ordre des sièges. */
  players: number;
  /** Numéro de la manche qui commence. */
  roundNo: number;
  /** Rôles de la manche précédente, par siège (null : pas de rôle). */
  roles: readonly (Role | null)[];
  rng: Rng;
  now: number;
}

/** Distribue et prépare une manche : échanges selon les rôles, premier joueur. */
export function startRound(input: StartRoundInput): Result<{ state: GameState; events: GameEvent[] }, GameRuleError> {
  const n = input.players;
  if (n < MIN_PLAYERS) return Result.err(ruleError('not_enough_players', 'Il faut au moins 3 joueurs pour commencer.'));
  if (n > MAX_PLAYERS) return Result.err(ruleError('too_many_players', 'Pas plus de 8 joueurs.'));

  // 52 cartes mélangées, données une par une à partir d'un siège tiré au sort.
  const hands = createHands(n);
  const deck = shuffledDeck(input.rng);
  const offset = input.rng(n);
  for (let i = 0; i < DECK_SIZE; i++) addCard(hands, (i + offset) % n, deck[i]!);

  const g: GameState = {
    n,
    roundNo: input.roundNo,
    phase: 'playing',
    hands,
    turn: -1,
    turnStartedAt: input.now,
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

  // Échanges : le Trou-du-cul donne ses 2 meilleures cartes au Président, qui lui en
  // rendra 2 de son choix ; idem avec 1 carte entre Vice-Trou-du-cul et Vice-Président.
  const seatOf = (role: Role) => input.roles.indexOf(role);
  const pres = seatOf('president');
  const trou = seatOf('trou');
  const vp = seatOf('vice_president');
  const vt = seatOf('vice_trou');
  const autoGive = (from: number, to: number, count: number) => {
    const best = highestCards(hands, from, count);
    for (const c of best) {
      removeCard(hands, from, c);
      addCard(hands, to, c);
    }
    g.exchanges.push(
      { from, to, count, cards: best, done: true },
      { from: to, to: from, count, cards: null, done: false },
    );
  };
  if (pres >= 0 && trou >= 0) autoGive(trou, pres, 2);
  if (vp >= 0 && vt >= 0) autoGive(vt, vp, 1);
  g.phase = g.exchanges.length > 0 ? 'exchange' : 'playing';

  // Le Trou-du-cul commence ; à la première manche, celui qui a la Dame de cœur.
  let first = trou;
  if (first < 0) for (let s = 0; s < n && first < 0; s++) if (hasCard(hands, s, QUEEN_OF_HEARTS)) first = s;
  g.turn = first;
  const events: GameEvent[] = [];
  pushEvent(g, events, { type: 'round_start', player: first, reason: trou >= 0 ? 'trou' : 'queen' });
  return Result.ok({ state: g, events });
}

// ---------------------------------------------------------------------------
// Coups
// ---------------------------------------------------------------------------

const FORMAT_MESSAGES = [
  '',
  'Ce pli se joue en cartes simples.',
  'Ce pli se joue en paires.',
  'Ce pli se joue en brelans.',
  'Ce pli se joue en carrés.',
];

/** Vérifie un coup sans modifier l'état. */
export function checkPlay(g: GameState, seat: number, cards: readonly Card[]): GameRuleError | null {
  const k = cards.length;
  if (g.phase !== 'playing') return ruleError('no_round', 'Aucune manche en cours.');
  if (g.turn !== seat) return ruleError('not_your_turn', "Ce n'est pas votre tour.");
  if (k < 1 || k > 4) return ruleError('card_count', 'Choisissez entre 1 et 4 cartes.');
  if (!ownsAll(g.hands, seat, cards)) return ruleError('not_your_cards', "Vous n'avez pas ces cartes.");
  const r = rankOf(cards[0]!);
  for (let i = 1; i < k; i++) {
    if (rankOf(cards[i]!) !== r) return ruleError('mixed_ranks', 'Les cartes jouées doivent avoir la même valeur.');
  }
  if (g.trickSize > 0) {
    if (k !== g.trickSize) return ruleError('wrong_format', FORMAT_MESSAGES[g.trickSize]!);
    const forced = forcedRank(g.trick, g.trickSize);
    if (forced !== 0 && r !== forced) {
      return ruleError('forced_rank', `${rankLabel(forced)} ou rien : jouez cette valeur ou passez.`);
    }
    if (r < g.trickRank) return ruleError('too_low', 'Il faut jouer une valeur égale ou supérieure.');
  }
  return null;
}

function applyPlay(g: GameState, seat: number, cards: readonly Card[], out: GameEvent[]): void {
  const k = cards.length;
  const r = rankOf(cards[0]!);
  for (const c of cards) removeCard(g.hands, seat, c);
  g.trick.push({ p: seat, c: sorted(cards) });
  g.trickSize = k;
  g.trickRank = r;
  g.lastPlayer = seat;
  g.passes = 0;

  if (handSize(g.hands, seat) === 0) {
    g.finished.push(seat);
    pushEvent(g, out, { type: 'finished', player: seat, position: g.finished.length });
  }

  // Coupe à 4 : les quatre cartes de la valeur sont sur le pli. Le 2 ferme le pli.
  const reason = rankCountInTrick(g.trick, r) >= 4 ? 'cut' : r === TWO ? 'two' : null;
  if (reason !== null) pushEvent(g, out, { type: reason, player: seat });

  if (activeCount(g) <= 1) finishRound(g, out);
  else if (reason !== null) closeTrick(g, seat);
  else g.turn = nextActive(g, seat);
}

export function playCards(g: GameState, seat: number, cards: readonly Card[], now: number): MoveResult {
  const error = checkPlay(g, seat, cards);
  if (error !== null) return Result.err(error);
  const out: GameEvent[] = [];
  applyPlay(g, seat, cards, out);
  g.turnStartedAt = now;
  return Result.ok(out);
}

function checkPass(g: GameState, seat: number): GameRuleError | null {
  if (g.phase !== 'playing') return ruleError('no_round', 'Aucune manche en cours.');
  if (g.turn !== seat) return ruleError('not_your_turn', "Ce n'est pas votre tour.");
  if (g.trickSize === 0) return ruleError('must_open', 'Vous ouvrez le pli : vous devez jouer.');
  return null;
}

function applyPass(g: GameState, seat: number, out: GameEvent[]): void {
  g.trick.push({ p: seat, c: null });
  g.passes += 1;
  // Le pli est remporté quand tous les autres joueurs encore en jeu ont passé.
  const needed = activeCount(g) - (handSize(g.hands, g.lastPlayer) > 0 ? 1 : 0);
  if (g.passes >= needed) {
    pushEvent(g, out, { type: 'won', player: g.lastPlayer });
    closeTrick(g, g.lastPlayer);
  } else {
    g.turn = nextActive(g, seat);
  }
}

export function passTurn(g: GameState, seat: number, now: number): MoveResult {
  const error = checkPass(g, seat);
  if (error !== null) return Result.err(error);
  const out: GameEvent[] = [];
  applyPass(g, seat, out);
  g.turnStartedAt = now;
  return Result.ok(out);
}

function pendingExchange(g: GameState, seat: number): number {
  return g.exchanges.findIndex((e) => e.from === seat && !e.done);
}

function checkGive(g: GameState, seat: number, cards: readonly Card[]): GameRuleError | null {
  if (g.phase !== 'exchange') return ruleError('no_exchange', "Il n'y a pas d'échange en cours.");
  const idx = pendingExchange(g, seat);
  if (idx < 0) return ruleError('nothing_to_give', "Vous n'avez pas de cartes à donner.");
  const count = g.exchanges[idx]!.count;
  if (cards.length !== count) return ruleError('give_count', `Choisissez exactement ${count} carte(s) à donner.`);
  if (!ownsAll(g.hands, seat, cards)) return ruleError('not_your_cards', "Vous n'avez pas ces cartes.");
  return null;
}

function applyGive(g: GameState, seat: number, cards: readonly Card[], out: GameEvent[]): void {
  const e = g.exchanges[pendingExchange(g, seat)]!;
  for (const c of cards) {
    removeCard(g.hands, seat, c);
    addCard(g.hands, e.to, c);
  }
  e.cards = sorted(cards);
  e.done = true;
  if (g.exchanges.every((x) => x.done)) {
    g.phase = 'playing';
    pushEvent(g, out, { type: 'exchange_done', player: g.turn });
  }
}

export function giveCards(g: GameState, seat: number, cards: readonly Card[], now: number): MoveResult {
  const error = checkGive(g, seat, cards);
  if (error !== null) return Result.err(error);
  const out: GameEvent[] = [];
  applyGive(g, seat, cards, out);
  g.turnStartedAt = now;
  return Result.ok(out);
}

// ---------------------------------------------------------------------------
// Passe automatique
// ---------------------------------------------------------------------------

/** Vrai si le délai par tour (en secondes, null = désactivé) est dépassé. */
export function isTimedOut(g: GameState, turnLimit: number | null, now: number): boolean {
  if (turnLimit === null) return false;
  if (g.phase !== 'playing' && g.phase !== 'exchange') return false;
  return now >= g.turnStartedAt + turnLimit * 1000;
}

/**
 * Délai dépassé : le joueur passe ; s'il ouvre le pli, sa plus petite carte est jouée ;
 * pendant l'échange, les retardataires donnent leurs cartes les plus faibles.
 * Ne renvoie aucun événement si rien n'est à jouer.
 */
export function autoMove(g: GameState, now: number): GameEvent[] {
  const out: GameEvent[] = [];
  if (g.phase === 'exchange') {
    for (const e of g.exchanges.filter((x) => !x.done)) {
      pushEvent(g, out, { type: 'timeout', player: e.from, action: 'give' });
      applyGive(g, e.from, lowestCards(g.hands, e.from, e.count), out);
    }
  } else if (g.phase === 'playing' && g.turn >= 0) {
    const seat = g.turn;
    if (g.trickSize === 0) {
      pushEvent(g, out, { type: 'timeout', player: seat, action: 'play' });
      applyPlay(g, seat, lowestCards(g.hands, seat, 1), out);
    } else {
      pushEvent(g, out, { type: 'timeout', player: seat, action: 'pass' });
      applyPass(g, seat, out);
    }
  }
  if (out.length > 0) g.turnStartedAt = now;
  return out;
}

/** Rôles en fin de manche (null tant que la manche n'est pas finie). */
export function roundRoles(g: GameState): Role[] | null {
  return g.phase === 'over' ? rolesFromFinish(g.finished, g.n) : null;
}

export { cardsOf };
