import type { Role } from './types';

export const ROLE_INFO: Record<Role, { fr: string; es: string; icon: string; order: number }> = {
  president: { fr: 'Président', es: 'El Presidente', icon: '👑', order: 1 },
  vice_president: { fr: 'Vice-Président', es: 'El Vicepresidente', icon: '🎩', order: 2 },
  neutral: { fr: 'Neutre', es: 'El Pueblo', icon: '🌵', order: 3 },
  vice_trou: { fr: 'Vice-Trou-du-cul', es: 'El Casi Pendejo', icon: '🥴', order: 4 },
  trou: { fr: 'Trou-du-cul', es: 'El Pendejo', icon: '💩', order: 5 },
};

export function ordinal(n: number) {
  return n === 1 ? '1er' : `${n}e`;
}
