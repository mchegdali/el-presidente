'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { syncPush } from '@/lib/push';
import { UNKNOWN_TABLE_URL } from '@/lib/routes';
import { useTable } from '@/lib/useTable';
import { mentions } from './Chat';
import { PapelPicado } from './Decor';
import GameView from './GameView';
import JoinForm from './JoinForm';
import Lobby from './Lobby';
import Results from './Results';

export type TableApi = ReturnType<typeof useTable> & {
  leave: () => Promise<void>;
  kick: (playerId: string, name: string) => Promise<void>;
};

export default function TableRoom({ code }: { code: string }) {
  const table = useTable(code);
  const router = useRouter();
  const { state, loadError, act, messages } = table;
  const notFound = loadError?.hint === 'not_found';

  useEffect(() => {
    if (notFound) router.replace(UNKNOWN_TABLE_URL);
  }, [notFound, router]);

  // Le navigateur déjà abonné aux notifications est associé au joueur de cette table.
  const me = state?.me;
  useEffect(() => {
    if (me) syncPush(code).catch(() => {});
  }, [code, me]);

  // @mention : vibration à l'arrivée d'un message qui me mentionne.
  const myName = state?.players.find((p) => p.id === me)?.name;
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const last = messages.at(-1)?.id ?? 0;
    if (seen.current !== null && myName) {
      const fresh = messages.filter((m) => m.id > (seen.current ?? 0) && m.p !== me);
      if (fresh.some((m) => mentions(m.body, myName))) navigator.vibrate?.([60, 40, 60]);
    }
    seen.current = last;
  }, [messages, me, myName]);

  const leave = useCallback(async () => {
    const inRound = state?.lobby.status === 'playing' || state?.lobby.status === 'exchange';
    const msg = inRound
      ? 'Quitter la table ? La manche en cours sera annulée pour tout le monde.'
      : 'Quitter la table ?';
    if (!window.confirm(msg)) return;
    if (await act('leave_lobby')) router.push('/');
  }, [act, router, state?.lobby.status]);

  const kick = useCallback(
    async (playerId: string, name: string) => {
      const inRound = state?.lobby.status === 'playing' || state?.lobby.status === 'exchange';
      const msg = inRound ? `Retirer ${name} ? La manche en cours sera annulée.` : `Retirer ${name} de la table ?`;
      if (window.confirm(msg)) await act('kick_player', { p_player: playerId });
    },
    [act, state?.lobby.status],
  );

  if (!state) {
    return (
      <>
        <PapelPicado />
        <main className="page centered">
          {loadError && !notFound ? (
            <div className="panel narrow">
              <h1 className="title-rye">Oups</h1>
              <p>{loadError.message}</p>
              <button type="button" className="btn btn--block" onClick={() => table.refresh()}>
                Réessayer
              </button>
            </div>
          ) : (
            <p className="loading title-rye">Barajando las cartas…</p>
          )}
        </main>
      </>
    );
  }

  const api: TableApi = { ...table, leave, kick };
  if (!state.me) return <JoinForm state={state} table={api} />;
  if (state.lobby.status === 'waiting') return <Lobby state={state} table={api} />;
  if (state.lobby.status === 'finished') return <Results state={state} table={api} />;
  return <GameView state={state} table={api} />;
}
