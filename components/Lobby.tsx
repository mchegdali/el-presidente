'use client';

import type { TableState } from '@/lib/types';
import { PapelPicado } from './Decor';
import InvitePanel from './InvitePanel';
import PlayersPanel from './PlayersPanel';
import Rules from './Rules';
import TopBar from './TopBar';
import type { TableApi } from './TableRoom';

export default function Lobby({ state, table }: { state: TableState; table: TableApi }) {
  const isHost = state.lobby.host_id === state.me;
  const host = state.players.find((p) => p.id === state.lobby.host_id);
  const n = state.players.length;

  return (
    <>
      <PapelPicado />
      <main className="page lobby">
        <TopBar state={state} table={table} title="La sala de espera" />
        {state.lobby.notice && <p className="notice">{state.lobby.notice}</p>}
        {table.actionError && (
          <p className="error" role="alert">
            {table.actionError}
          </p>
        )}
        <div className="lobby__grid">
          <InvitePanel code={state.lobby.code} />
          <PlayersPanel state={state} busy={table.busy} onKick={table.kick} />
        </div>
        <div className="lobby__start">
          {isHost ? (
            <>
              <button
                type="button"
                className="btn btn--gold btn--big"
                disabled={table.busy || n < 3}
                onClick={() => table.act('start_round')}
              >
                ¡Vámonos! Distribuer les cartes
              </button>
              {n < 3 && <p className="muted">Il faut au moins 3 joueurs ({3 - n} de plus).</p>}
            </>
          ) : (
            <p className="waiting">
              En attente de <strong>{host?.name ?? "l'hôte"}</strong> pour lancer la partie…
            </p>
          )}
        </div>
        <Rules />
      </main>
    </>
  );
}
