// Hasard injectable : `rng(n)` renvoie un entier uniforme dans [0, n).

import { DECK_SIZE, type Card } from './cards';

export type Rng = (bound: number) => number;

const POOL = new Uint32Array(64);
let poolIndex = POOL.length;

/** Hasard cryptographique, sans biais de modulo (rejet des valeurs hors plage). */
export const cryptoRng: Rng = (bound) => {
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % bound);
  for (;;) {
    if (poolIndex === POOL.length) {
      crypto.getRandomValues(POOL);
      poolIndex = 0;
    }
    const x = POOL[poolIndex++]!;
    if (x < limit) return x % bound;
  }
};

/** Générateur déterministe (mulberry32), pour les tests et le banc de charge. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (bound) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000) * bound) >>> 0;
  };
}

/** Jeu de 52 cartes mélangé (Fisher-Yates). */
export function shuffledDeck(rng: Rng): Uint8Array {
  const deck = new Uint8Array(DECK_SIZE);
  for (let i = 0; i < DECK_SIZE; i++) deck[i] = i;
  for (let i = DECK_SIZE - 1; i > 0; i--) {
    const j = rng(i + 1);
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp as Card;
  }
  return deck;
}
