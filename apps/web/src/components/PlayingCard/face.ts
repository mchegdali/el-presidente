// Habillage des cartes (couleurs, noms façon Lotería). Les règles sont dans @el-presidente/game.

import type { Suit } from '@el-presidente/game';

export const suitOfText = (card: string) => card[1] as Suit;
export const rankCharOf = (card: string) => card[0] as string;

// Jeu à quatre couleurs, palette mexicaine.
export const SUIT_COLORS: Record<Suit, string> = {
  S: '#1d2b53', // azul noche
  H: '#d6246e', // rosa mexicano
  D: '#e0631a', // naranja
  C: '#1f7a4d', // verde nopal
};

const SHORT: Record<string, string> = { T: '10', J: 'V', Q: 'D', K: 'R', A: 'A' };
/** Index affiché dans le coin de la carte. */
export const indexLabel = (card: string) => SHORT[rankCharOf(card)] ?? rankCharOf(card);

const SUIT_NAMES: Record<Suit, string> = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
const RANK_NAMES: Record<string, string> = { T: '10', J: 'Valet', Q: 'Dame', K: 'Roi', A: 'As' };

export function cardName(card: string) {
  return `${RANK_NAMES[rankCharOf(card)] ?? rankCharOf(card)} de ${SUIT_NAMES[suitOfText(card)]}`;
}

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

export const loteriaName = (card: string) => LOTERIA_NAMES[rankCharOf(card)] ?? '';
