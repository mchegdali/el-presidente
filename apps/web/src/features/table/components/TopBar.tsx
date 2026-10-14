'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PushToggle } from '../../push/PushToggle';
import { useTableContext } from '../context';
import { TurnLimitSetting } from './TurnLimitSetting';
import styles from './TopBar.module.css';

export function TopBar({ title }: { title?: string }) {
  const { table, conn, actions, isHost, inRound } = useTableContext();
  const router = useRouter();
  const [menu, setMenu] = useState(false);

  const cancelRound = () => {
    setMenu(false);
    if (window.confirm('Annuler la manche en cours pour tout le monde ?')) void actions.cancel();
  };

  const leave = async () => {
    setMenu(false);
    const msg = inRound
      ? 'Quitter la table ? La manche en cours sera annulée pour tout le monde.'
      : 'Quitter la table ?';
    if (!window.confirm(msg)) return;
    if ((await actions.leave()).ok) router.push('/');
  };

  return (
    <div className={styles.topbar}>
      <div className={styles.left}>
        <span className={`${styles.brand} title-rye`}>El Presidente</span>
        {title && <span className={styles.title}>{title}</span>}
      </div>
      <div className={styles.right}>
        <span
          className={conn.live ? `${styles.live} ${styles.on}` : styles.live}
          title={conn.live ? 'Connecté en temps réel' : 'Reconnexion…'}
        >
          {table.code}
        </span>
        <div className={styles.menu}>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-label="Menu"
          >
            ⋯
          </button>
          {menu && (
            <div className={styles.list} role="menu">
              {inRound && (
                <div className={styles.settings}>
                  <TurnLimitSetting />
                  <PushToggle compact />
                </div>
              )}
              {isHost && inRound && (
                <button type="button" role="menuitem" onClick={cancelRound}>
                  Annuler la manche
                </button>
              )}
              <button type="button" role="menuitem" onClick={leave}>
                Quitter la table
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
