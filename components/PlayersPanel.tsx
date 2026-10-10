'use client';

import type { TableState } from '@/lib/types';
import { ROLE_INFO } from '@/lib/roles';

type Props = {
  state: TableState;
  busy: boolean;
  onKick: (playerId: string, name: string) => void;
};

export default function PlayersPanel({ state, busy, onKick }: Props) {
  const isHost = state.lobby.host_id === state.me;
  return (
    <section className="panel players">
      <h2 className="title-rye">
        Los jugadores <span className="players__count">{state.players.length}/8</span>
      </h2>
      <ul className="players__list">
        {state.players.map((p, i) => (
          <li key={p.id} className={p.id === state.me ? 'players__me' : ''}>
            <span className="players__seat">{i + 1}</span>
            <span className="players__name">
              {p.name}
              {p.id === state.me && <em> (vous)</em>}
            </span>
            {p.id === state.lobby.host_id && (
              <span className="tag" title="Créateur de la table">
                Hôte
              </span>
            )}
            {p.role && (
              <span className="tag tag--role" title={ROLE_INFO[p.role].fr}>
                {ROLE_INFO[p.role].icon} {ROLE_INFO[p.role].fr}
              </span>
            )}
            {isHost && p.id !== state.me && (
              <button
                type="button"
                className="players__kick"
                disabled={busy}
                onClick={() => onKick(p.id, p.name)}
                aria-label={`Retirer ${p.name}`}
                title={`Retirer ${p.name}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
