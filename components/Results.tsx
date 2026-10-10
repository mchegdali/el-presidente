'use client';

import { ROLE_INFO, ordinal } from '@/lib/roles';
import type { Role, TableState } from '@/lib/types';
import { PapelPicado } from './Decor';
import InvitePanel from './InvitePanel';
import PlayersPanel from './PlayersPanel';
import TopBar from './TopBar';
import type { TableApi } from './TableRoom';

export default function Results({ state, table }: { state: TableState; table: TableApi }) {
  const isHost = state.lobby.host_id === state.me;
  const host = state.players.find((p) => p.id === state.lobby.host_id);
  const game = state.game;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const ranking = (game?.finished ?? [])
    .map((id, i) => ({ player: byId.get(id), position: i + 1 }))
    .filter((r) => r.player);
  const newcomers = state.players.filter((p) => !game?.finished.includes(p.id));
  const enough = state.players.length >= 3;

  return (
    <>
      <PapelPicado />
      <main className="page results">
        <TopBar state={state} table={table} title={`Fin de la manche ${state.lobby.round_no}`} />
        <h1 className="results__title title-rye">¡Se acabó la ronda!</h1>
        {table.actionError && (
          <p className="error" role="alert">
            {table.actionError}
          </p>
        )}

        <ol className="podium">
          {ranking.map(({ player, position }) => {
            const role = ROLE_INFO[player!.role as Role] ?? ROLE_INFO.neutral;
            return (
              <li key={player!.id} className={`podium__row podium__row--${player!.role}`}>
                <span className="podium__pos">{ordinal(position)}</span>
                <span className="podium__icon" aria-hidden="true">
                  {role.icon}
                </span>
                <span className="podium__who">
                  <strong>{player!.name}</strong>
                  {player!.id === state.me && <em> (vous)</em>}
                </span>
                <span className="podium__role">
                  <span className="podium__fr">{role.fr}</span>
                  <span className="podium__es title-rye">{role.es}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {newcomers.length > 0 && (
          <p className="muted">
            {newcomers.map((p) => p.name).join(', ')} rejoindr{newcomers.length > 1 ? 'ont' : 'a'} la prochaine manche.
          </p>
        )}

        <div className="lobby__start">
          {isHost ? (
            <>
              <button
                type="button"
                className="btn btn--gold btn--big"
                disabled={table.busy || !enough}
                onClick={() => table.act('start_round')}
              >
                ¡Otra ronda! Rejouer
              </button>
              {!enough && <p className="muted">Il faut au moins 3 joueurs.</p>}
            </>
          ) : (
            <p className="waiting">
              En attente de <strong>{host?.name ?? "l'hôte"}</strong> pour relancer une manche…
            </p>
          )}
          <p className="muted small">
            Au début de la manche, le Trou-du-cul donne ses 2 meilleures cartes au Président, qui lui en rend 2 de son
            choix.
          </p>
        </div>

        <div className="lobby__grid">
          <PlayersPanel state={state} busy={table.busy} onKick={table.kick} />
          <InvitePanel code={state.lobby.code} compact />
        </div>
      </main>
    </>
  );
}
