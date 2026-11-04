// Ordre d'affichage de la main, choisi par le joueur et gardé dans le navigateur.

import { useSyncExternalStore } from 'react';
import { rankOfText } from './cards';

export type HandOrder = 'rank' | 'groups';

export const HAND_ORDER_LABELS: Record<HandOrder, string> = { rank: 'par valeur', groups: 'par combinaisons' };

const STORAGE_NAME = 'presidente:hand-order';
const listeners = new Set<() => void>();

function read(): HandOrder {
  try {
    return localStorage.getItem(STORAGE_NAME) === 'groups' ? 'groups' : 'rank';
  } catch {
    return 'rank';
  }
}

export function setHandOrder(order: HandOrder): void {
  try {
    localStorage.setItem(STORAGE_NAME, order);
  } catch {
    // stockage indisponible (navigation privée) : le choix vaut pour la page
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_NAME) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export const useHandOrder = () => useSyncExternalStore(subscribe, read, (): HandOrder => 'rank');

/**
 * Main dans l'ordre choisi (`cards` est triée par valeur). « Par combinaisons » : simples,
 * puis paires, brelans et carrés, chaque groupe par valeur. `breaks` : cartes qui ouvrent
 * un nouveau groupe (un espace les sépare à l'écran).
 */
export function arrangeHand(cards: readonly string[], order: HandOrder): { cards: string[]; breaks: Set<string> } {
  if (order === 'rank') return { cards: [...cards], breaks: new Set() };
  const byRank = new Map<number, string[]>();
  for (const c of cards) {
    const r = rankOfText(c);
    const same = byRank.get(r);
    if (same) same.push(c);
    else byRank.set(r, [c]);
  }
  const groups = [...byRank.entries()].sort(([ra, a], [rb, b]) => a.length - b.length || ra - rb);
  const out: string[] = [];
  const breaks = new Set<string>();
  let prevSize = 0;
  for (const [, group] of groups) {
    if (out.length > 0 && group.length !== prevSize) breaks.add(group[0]!);
    out.push(...group);
    prevSize = group.length;
  }
  return { cards: out, breaks };
}
