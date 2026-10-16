// Règles vues de l'interface : cartes en texte ('QH'), règles de @el-presidente/game.

import {
  FORMAT_LABELS,
  parseCard,
  playableCards as playable,
  rankLabel,
  rankOf,
  selectionProblem as problem,
} from '@el-presidente/game';
import type { TrickEntryView } from '@el-presidente/game';

export { FORMAT_LABELS, rankLabel };

export const rankOfText = (card: string) => rankOf(parseCard(card));
export const sortCards = (cards: readonly string[]) => [...cards].sort((a, b) => parseCard(a) - parseCard(b));

/** Carte ou rien, sur la vue du pli : valeur imposée, ou 0. */
export function forcedRankOf(trick: readonly TrickEntryView[], trickSize: number): number {
  if (trickSize !== 1 || trick.length < 2) return 0;
  const prev = trick[trick.length - 2]!;
  const last = trick[trick.length - 1]!;
  if (!('c' in prev) || !('c' in last)) return 0;
  const r = rankOfText(last.c[0]!);
  return rankOfText(prev.c[0]!) === r ? r : 0;
}

export function playableCards(hand: readonly string[], trickSize: number, trickRank: number, forced: number) {
  const ok = playable(hand.map(parseCard), trickSize, trickRank, forced);
  return new Set(hand.filter((c) => ok.has(parseCard(c))));
}

export const selectionProblem = (selected: readonly string[], trickSize: number, trickRank: number, forced: number) =>
  problem(selected.map(parseCard), trickSize, trickRank, forced);

export const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);
