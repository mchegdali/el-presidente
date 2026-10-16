import type { Role } from '@el-presidente/game';

export const ROLE_INFO: Record<Role, { fr: string; es: string; icon: string }> = {
  president: { fr: 'Président', es: 'El Presidente', icon: '👑' },
  vice_president: { fr: 'Vice-Président', es: 'El Vicepresidente', icon: '🎩' },
  neutral: { fr: 'Neutre', es: 'El Pueblo', icon: '🌵' },
  vice_trou: { fr: 'Vice-Trou-du-cul', es: 'El Casi Pendejo', icon: '🥴' },
  trou: { fr: 'Trou-du-cul', es: 'El Pendejo', icon: '💩' },
};
