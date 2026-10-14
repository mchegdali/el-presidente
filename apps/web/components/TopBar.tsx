'use client';

import { useState } from 'react';
import type { TableState } from '@/lib/types';
import { PushToggle, TurnLimitSetting } from './TableSettings';
import type { TableApi } from './TableRoom';

export default function TopBar({ state, table, title }: { state: TableState; table: TableApi; title?: string }) {
  const [menu, setMenu] = useState(false);
  const isHost = state.lobby.host_id === state.me;
  const inRound = state.lobby.status === 'playing' || state.lobby.status === 'exchange';

  const cancelRound = () => {
    setMenu(false);
    if (window.confirm('Annuler la manche en cours pour tout le monde ?')) table.act('cancel_round');
  };

  return (
    <div className="topbar">
      <div className="topbar__left">
        <span className="topbar__brand title-rye">El Presidente</span>
        {title && <span className="topbar__title">{title}</span>}
      </div>
      <div className="topbar__right">
        <span
          className={`live ${table.live ? 'live--on' : ''}`}
          title={table.live ? 'Connecté en temps réel' : 'Synchronisation périodique'}
        >
          {state.lobby.code}
        </span>
        <div className="menu">
          <button
            type="button"
            className="menu__toggle"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-label="Menu"
          >
            ⋯
          </button>
          {menu && (
            <div className="menu__list" role="menu">
              {inRound && (
                <div className="menu__settings">
                  <TurnLimitSetting state={state} table={table} />
                  <PushToggle code={state.lobby.code} compact />
                </div>
              )}
              {isHost && inRound && (
                <button type="button" role="menuitem" onClick={cancelRound}>
                  Annuler la manche
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  table.leave();
                }}
              >
                Quitter la table
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
