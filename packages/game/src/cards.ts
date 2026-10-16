// Cartes encodées sur un entier 0–51 : (valeur - 1) * 4 + couleur.
// Valeurs dans l'ordre du Président : 1 = 3, 2 = 4, …, 12 = As, 13 = 2.
// Couleurs dans l'ordre de tri : trèfle, carreau, cœur, pique.
// L'ordre des entiers est donc l'ordre de tri des cartes en main.
//
// Côté interface et persistance, une carte s'écrit sur 2 caractères : valeur puis couleur
// ('TH' = 10 de cœur, 'QH' = Dame de cœur).

export type Card = number;
export type Rank = number;
export type Suit = 'C' | 'D' | 'H' | 'S';

export const RANKS = '3456789TJQKA2';
export const SUITS = 'CDHS';
export const DECK_SIZE = 52;
export const TWO: Rank = 13;
export const QUEEN_OF_HEARTS: Card = cardOf(10, 2);

export function cardOf(rank: Rank, suitIndex: number): Card {
  return (rank - 1) * 4 + suitIndex;
}

export const rankOf = (card: Card): Rank => (card >> 2) + 1;
export const suitIndexOf = (card: Card): number => card & 3;
export const suitOf = (card: Card): Suit => SUITS[card & 3] as Suit;

export function isCard(value: unknown): value is Card {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DECK_SIZE;
}

/** 'QH' → carte, ou -1 si la chaîne n'est pas une carte. */
export function parseCard(text: string): Card {
  if (text.length !== 2) return -1;
  const r = RANKS.indexOf(text[0] as string);
  const s = SUITS.indexOf(text[1] as string);
  return r < 0 || s < 0 ? -1 : r * 4 + s;
}

const CARD_TEXT: readonly string[] = Array.from({ length: DECK_SIZE }, (_, c) => RANKS[c >> 2]! + SUITS[c & 3]!);

export const formatCard = (card: Card): string => CARD_TEXT[card]!;
export const formatCards = (cards: readonly Card[]): string[] => cards.map(formatCard);

const RANK_LABELS = ['3', '4', '5', '6', '7', '8', '9', '10', 'Valet', 'Dame', 'Roi', 'As', '2'];

/** Libellé d'une valeur pour les messages (« Dame ou rien »). */
export const rankLabel = (rank: Rank): string => RANK_LABELS[rank - 1] ?? '?';
