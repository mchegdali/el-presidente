// « À vous de jouer » pour les joueurs qui doivent agir et dont aucun onglet n'est au
// premier plan. Une seule notification par tour et par joueur.

import type { Deps } from '../../shared/deps';
import type { Table } from '../tables/shared/table';

export function notifyTurn(deps: Deps, table: Table): void {
  const g = table.game;
  if (g === null || (g.phase !== 'playing' && g.phase !== 'exchange') || deps.push.publicKey === null) return;
  const seats = g.phase === 'playing' ? [g.turn] : g.exchanges.filter((e) => !e.done).map((e) => e.from);
  for (const seat of seats) {
    const p = table.players[seat];
    if (p === undefined || table.isOnline(p.userId) || table.notified.get(p.userId) === g.turnStartedAt) continue;
    table.notified.set(p.userId, g.turnStartedAt);
    deps.push.send(p.userId, {
      title: '¡Te toca! À vous de jouer',
      body:
        g.phase === 'exchange'
          ? `Choisissez les cartes à donner (table ${table.code}).`
          : `C'est votre tour à la table ${table.code}.`,
      url: `/t/${table.code}`,
    });
  }
}
