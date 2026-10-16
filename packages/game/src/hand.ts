// Mains en masques de bits : 52 cartes sur deux entiers 32 bits par joueur.
// La carte c est le bit c (0–31) du premier mot, ou le bit c - 32 du second.
// Les 4 cartes d'une valeur occupent 4 bits consécutifs : valeurs 1–8 dans le premier
// mot, 9–13 dans le second. Compter une valeur = un décalage et un popcount.

import { DECK_SIZE, type Card, type Rank } from './cards';

export type Hands = Uint32Array;

export const createHands = (seats: number): Hands => new Uint32Array(seats * 2);

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

export function hasCard(hands: Hands, seat: number, card: Card): boolean {
  return card < 32 ? ((hands[seat * 2]! >>> card) & 1) === 1 : ((hands[seat * 2 + 1]! >>> (card - 32)) & 1) === 1;
}

export function addCard(hands: Hands, seat: number, card: Card): void {
  if (card < 32) hands[seat * 2]! |= 1 << card;
  else hands[seat * 2 + 1]! |= 1 << (card - 32);
}

export function removeCard(hands: Hands, seat: number, card: Card): void {
  if (card < 32) hands[seat * 2]! &= ~(1 << card);
  else hands[seat * 2 + 1]! &= ~(1 << (card - 32));
}

export function handSize(hands: Hands, seat: number): number {
  return popcount(hands[seat * 2]!) + popcount(hands[seat * 2 + 1]!);
}

/** Nombre de cartes de la valeur `rank` dans la main. */
export function rankCount(hands: Hands, seat: number, rank: Rank): number {
  return rank <= 8
    ? popcount((hands[seat * 2]! >>> ((rank - 1) * 4)) & 0xf)
    : popcount((hands[seat * 2 + 1]! >>> ((rank - 9) * 4)) & 0xf);
}

/** Cartes de la main, triées. */
export function cardsOf(hands: Hands, seat: number): Card[] {
  const out: Card[] = [];
  for (let c = 0; c < DECK_SIZE; c++) if (hasCard(hands, seat, c)) out.push(c);
  return out;
}

/** Les `count` plus petites cartes de la main. */
export function lowestCards(hands: Hands, seat: number, count: number): Card[] {
  const out: Card[] = [];
  for (let c = 0; c < DECK_SIZE && out.length < count; c++) if (hasCard(hands, seat, c)) out.push(c);
  return out;
}

/** Les `count` plus fortes cartes de la main, triées. */
export function highestCards(hands: Hands, seat: number, count: number): Card[] {
  const out: Card[] = [];
  for (let c = DECK_SIZE - 1; c >= 0 && out.length < count; c--) if (hasCard(hands, seat, c)) out.push(c);
  return out.toReversed();
}

export function setHand(hands: Hands, seat: number, cards: readonly Card[]): void {
  hands[seat * 2] = 0;
  hands[seat * 2 + 1] = 0;
  for (const c of cards) addCard(hands, seat, c);
}
