// Aides pour l'interface et les bots : le serveur reste seul juge (voir engine.ts).

import { rankLabel, rankOf, type Card } from './cards';

export const FORMAT_LABELS = ['', 'Simples', 'Paires', 'Brelans', 'Carré'];

/** Coups légaux (une combinaison par valeur et par taille), main triée. */
export function legalPlays(hand: readonly Card[], trickSize: number, trickRank: number, forced = 0): Card[][] {
  const byRank = new Map<number, Card[]>();
  for (const c of hand) {
    const r = rankOf(c);
    const cards = byRank.get(r);
    if (cards) cards.push(c);
    else byRank.set(r, [c]);
  }
  const plays: Card[][] = [];
  for (const [r, cards] of byRank) {
    if (trickSize === 0) {
      for (let k = 1; k <= cards.length; k++) plays.push(cards.slice(0, k));
    } else if (cards.length >= trickSize && r >= trickRank && (forced === 0 || r === forced)) {
      plays.push(cards.slice(0, trickSize));
    }
  }
  return plays;
}

/** Cartes pouvant participer à un coup légal dans le pli en cours. */
export function playableCards(hand: readonly Card[], trickSize: number, trickRank: number, forced = 0): Set<Card> {
  if (trickSize === 0) return new Set(hand);
  const ok = new Set<Card>();
  for (const play of legalPlays(hand, trickSize, trickRank, forced)) {
    const r = rankOf(play[0]!);
    for (const c of hand) if (rankOf(c) === r) ok.add(c);
  }
  return ok;
}

/** Problème d'une sélection, ou null si elle est jouable. */
export function selectionProblem(
  selected: readonly Card[],
  trickSize: number,
  trickRank: number,
  forced = 0,
): string | null {
  if (selected.length === 0) return 'Sélectionnez vos cartes';
  const r = rankOf(selected[0]!);
  if (selected.some((c) => rankOf(c) !== r)) return 'Les cartes doivent avoir la même valeur';
  if (trickSize === 0) return selected.length > 4 ? '4 cartes maximum' : null;
  if (selected.length !== trickSize) return `Il faut des ${FORMAT_LABELS[trickSize]!.toLowerCase()}`;
  if (forced !== 0 && r !== forced) return `${rankLabel(forced)} ou rien`;
  if (r < trickRank) return `Il faut ${rankLabel(trickRank)} ou plus`;
  return null;
}
