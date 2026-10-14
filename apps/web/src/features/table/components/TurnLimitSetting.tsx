'use client';

import { useActionState } from 'react';
import { Select } from '@/components/Field/Field';
import { useTableContext } from '../context';
import styles from './TurnLimitSetting.module.css';

export const TURN_LIMITS: { value: number; label: string }[] = [
  { value: 0, label: 'Désactivée' },
  { value: 15, label: '15 secondes' },
  { value: 30, label: '30 secondes' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
];

export function turnLimitLabel(limit: number | null) {
  if (!limit) return 'désactivée';
  return TURN_LIMITS.find((t) => t.value === limit)?.label.toLowerCase() ?? `${limit} s`;
}

/** Délai par tour : l'hôte le règle (ou le désactive), les autres le voient. */
export function TurnLimitSetting() {
  const { table, isHost, actions } = useTableContext();
  const [error, save, pending] = useActionState(async (_prev: string | null, data: FormData) => {
    const r = await actions.setTurnLimit(Number(data.get('turnLimit')));
    return r.ok ? null : r.message;
  }, null);

  if (!isHost) {
    return (
      <p className={`${styles.setting} muted`}>
        ⏱ Passe automatique : <strong>{turnLimitLabel(table.turnLimit)}</strong>
      </p>
    );
  }
  const limit = table.turnLimit ?? 0;
  return (
    <form action={save} className={styles.setting}>
      <label className={styles.setting}>
        <span>⏱ Passe automatique après</span>
        <Select
          name="turnLimit"
          value={limit}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {TURN_LIMITS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
          {!TURN_LIMITS.some((t) => t.value === limit) && <option value={limit}>{limit} s</option>}
        </Select>
      </label>
      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}
