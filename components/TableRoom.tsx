'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useTable } from '@/lib/useTable';
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
  const { state, loadError, act } = table;

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
          {loadError ? (
            <div className="panel narrow">
              <h1 className="title-rye">{loadError.hint === 'not_found' ? '¡Ay, caramba!' : 'Oups'}</h1>
              <p>{loadError.message}</p>
              {loadError.hint === 'not_found' && (
                <p className="muted">Les tables inactives depuis deux jours sont supprimées.</p>
              )}
              <Link href="/" className="btn btn--block">
                Retour à l&apos;accueil
              </Link>
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
