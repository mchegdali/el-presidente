'use client';

import { useActionState } from 'react';
import { useTableContext } from '../context';
import styles from './TurnLimitSetting.module.css';

/** Variante « interdit de finir sur un 2 » : l'hôte l'active, les autres la voient. */
export function NoTwoFinishSetting() {
  const { table, isHost, actions } = useTableContext();
  const [error, save, pending] = useActionState(async (_prev: string | null, data: FormData) => {
    const r = await actions.setNoTwoFinish(data.get('noTwoFinish') === 'on');
    return r.ok ? null : r.message;
  }, null);

  // Pendant une manche, le réglage vaut pour la suivante.
  const inRound = table.status === 'playing' || table.status === 'exchange';
  const later = inRound && table.game !== null && table.game.noTwoFinish !== table.noTwoFinish;
  const note = later && <span className="muted small"> (à la prochaine manche)</span>;

  if (!isHost) {
    return (
      <p className={`${styles.setting} muted`}>
        🚫 Finir sur un 2 : <strong>{table.noTwoFinish ? 'interdit' : 'permis'}</strong>
        {note}
      </p>
    );
  }
  return (
    <form action={save} className={styles.setting}>
      <label className={styles.setting}>
        <input
          type="checkbox"
          name="noTwoFinish"
          checked={table.noTwoFinish === true}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        <span>
          🚫 Interdit de finir sur un 2 <span className="muted small">(qui sort sur un 2 finit Trou-du-cul)</span>
          {note}
        </span>
      </label>
      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}
