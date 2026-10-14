'use client';

import { Panel } from '@/components/Panel/Panel';
import { Tag } from '@/components/Tag/Tag';
import { ROLE_INFO } from '../../game/roles';
import { useTableContext } from '../context';
import styles from './PlayersPanel.module.css';

export function PlayersPanel() {
  const { table, me, isHost, inRound, actions } = useTableContext();

  const kick = (userId: string, name: string) => {
    const msg = inRound ? `Retirer ${name} ? La manche en cours sera annulée.` : `Retirer ${name} de la table ?`;
    if (window.confirm(msg)) void actions.kick(userId);
  };

  return (
    <Panel>
      <h2 className={`${styles.heading} title-rye`}>
        Los jugadores <span className={styles.count}>{table.players.length}/8</span>
      </h2>
      <ul className={styles.list}>
        {table.players.map((p) => (
          <li key={p.id} className={p.seat === me ? styles.me : undefined}>
            <span className={styles.seat}>{p.seat + 1}</span>
            <span className={styles.name}>
              {p.name}
              {p.seat === me && <em> (vous)</em>}
            </span>
            {p.seat === table.hostSeat && <Tag title="Créateur de la table">Hôte</Tag>}
            {p.role && (
              <Tag variant="role" title={ROLE_INFO[p.role].fr}>
                {ROLE_INFO[p.role].icon} {ROLE_INFO[p.role].fr}
              </Tag>
            )}
            {isHost && p.seat !== me && (
              <button
                type="button"
                className={styles.kick}
                onClick={() => kick(p.id, p.name)}
                aria-label={`Retirer ${p.name}`}
                title={`Retirer ${p.name}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
