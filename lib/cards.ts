// Cartes : 2 caractères, valeur puis couleur ('TH' = 10 de cœur).
// Ordre du Président : 3 < 4 < … < R < A < 2.

export const RANKS = '3456789TJQKA2';
export type Suit = 'S' | 'H' | 'D' | 'C';

export const rankOf = (card: string) => RANKS.indexOf(card[0]) + 1;
export const suitOf = (card: string) => card[1] as Suit;

const RANK_LABELS: Record<string, string> = { T: '10', J: 'V', Q: 'D', K: 'R', A: 'A' };
export const rankLabel = (card: string) => RANK_LABELS[card[0]] ?? card[0];

/** Libellé d'une valeur (1 = 3, …, 13 = 2), pour les messages. */
export const rankValueLabel = (rank: number) => rankLabel(RANKS[rank - 1] + 'S');

export const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES: Record<Suit, string> = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
const RANK_NAMES: Record<string, string> = {
  T: '10',
  J: 'Valet',
  Q: 'Dame',
  K: 'Roi',
  A: 'As',
};

// Jeu à quatre couleurs, palette mexicaine.
export const SUIT_COLORS: Record<Suit, string> = {
  S: '#1d2b53', // azul noche
  H: '#d6246e', // rosa mexicano
  D: '#e0631a', // naranja
  C: '#1f7a4d', // verde nopal
};

// Bandeau façon Lotería.
const LOTERIA_NAMES: Record<string, string> = {
  '3': 'TRES',
  '4': 'CUATRO',
  '5': 'CINCO',
  '6': 'SEIS',
  '7': 'SIETE',
  '8': 'OCHO',
  '9': 'NUEVE',
  T: 'DIEZ',
  J: 'EL LUCHADOR',
  Q: 'LA CATRINA',
  K: 'EL PRESIDENTE',
  A: 'EL AS',
  '2': 'EL MERO MERO',
};

export const loteriaName = (card: string) => LOTERIA_NAMES[card[0]];

export function cardName(card: string) {
  const r = RANK_NAMES[card[0]] ?? card[0];
  const suit = SUIT_NAMES[suitOf(card)];
  return `${r} de ${suit}`;
}

export const cardOrder = (card: string) => rankOf(card) * 4 + 'CDHS'.indexOf(card[1]);
export const sortCards = (cards: string[]) => [...cards].sort((a, b) => cardOrder(a) - cardOrder(b));

export const FORMAT_LABELS: Record<number, string> = {
  1: 'Simples',
  2: 'Paires',
  3: 'Brelans',
  4: 'Carré',
};

/**
 * Vérifie une sélection côté client (le serveur reste seul juge).
 * Retourne null si le coup est jouable, sinon la raison.
 */
export function selectionProblem(selected: string[], trickSize: number, trickRank: number): string | null {
  if (selected.length === 0) return 'Sélectionnez vos cartes';
  if (new Set(selected.map(rankOf)).size > 1) return 'Les cartes doivent avoir la même valeur';
  if (trickSize === 0) return selected.length > 4 ? '4 cartes maximum' : null;
  if (selected.length !== trickSize) return `Il faut ${FORMAT_LABELS[trickSize].toLowerCase()}`;
  if (rankOf(selected[0]) < trickRank) return `Il faut ${rankValueLabel(trickRank)} ou plus`;
  return null;
}

/** Cartes pouvant participer à un coup légal dans le pli en cours. */
export function playableCards(hand: string[], trickSize: number, trickRank: number): Set<string> {
  if (trickSize === 0) return new Set(hand);
  const byRank = new Map<number, string[]>();
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
  const ok = new Set<string>();
  for (const [r, cards] of byRank) {
    if (r >= trickRank && cards.length >= trickSize) cards.forEach((c) => ok.add(c));
  }
  return ok;
}
