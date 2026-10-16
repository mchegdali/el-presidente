// État d'une table côté client : état complet reçu du serveur, puis avancé message par
// message. Fonctions pures (testées) ; le cache TanStack Query porte le résultat.

import { rolesFromFinish } from '@el-presidente/game';
import { applyMove, type LobbyStatus, type ServerMessage, type TableSnapshot } from '@el-presidente/game/protocol';

const STATUS: Record<'exchange' | 'playing' | 'over', LobbyStatus> = {
  exchange: 'exchange',
  playing: 'playing',
  over: 'finished',
};

/**
 * Applique un message à l'état de la table. Renvoie `'resync'` si un message a été manqué
 * (version inattendue) : le client redemande alors un état complet.
 */
export function reduceTable(
  state: TableSnapshot | undefined,
  msg: ServerMessage,
): TableSnapshot | 'resync' | undefined {
  switch (msg.op) {
    case 'snapshot':
      return msg.snapshot;
    case 'move': {
      if (state === undefined || state.game === null) return 'resync';
      if (msg.version !== state.version + 1) return msg.version <= state.version ? state : 'resync';
      const next = applyMove({ view: state.game, hand: state.hand, me: state.me }, msg);
      const status = STATUS[next.view.phase];
      const players =
        next.view.phase === 'over' && state.game.phase !== 'over'
          ? (() => {
              const roles = rolesFromFinish(next.view.finished, next.view.counts.length);
              return state.players.map((p) => ({ ...p, role: roles[p.seat] ?? p.role }));
            })()
          : state.players;
      return { ...state, version: msg.version, status, players, game: next.view, hand: next.hand };
    }
    case 'emote':
      if (state === undefined) return state;
      return {
        ...state,
        players: state.players.map((p) => (p.seat === msg.seat ? { ...p, emote: msg.emote, emoteAt: msg.at } : p)),
      };
    case 'presence':
      if (state === undefined) return state;
      return { ...state, players: state.players.map((p) => (p.seat === msg.seat ? { ...p, online: msg.online } : p)) };
    case 'chat':
      return state === undefined ? state : { ...state, chatLast: Math.max(state.chatLast ?? 0, msg.message.id) };
    default:
      return state;
  }
}
