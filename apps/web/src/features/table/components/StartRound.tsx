'use client';

import { useActionState, type ReactNode } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { useTableContext } from '../context';
import styles from './Room.module.css';

/** Lancement de la manche (hôte) ou attente (les autres). */
export function StartRound({ label, waiting, children }: { label: string; waiting: string; children?: ReactNode }) {
  const { table, isHost, actions } = useTableContext();
  const n = table.players.length;
  const host = table.players[table.hostSeat];
  const [error, start, pending] = useActionState(async () => {
    const r = await actions.start();
    return r.ok ? null : r.message;
  }, null);

  return (
    <div className={styles.start}>
      {error && <Alert>{error}</Alert>}
      {isHost ? (
        <form action={start}>
          <Button type="submit" variant="gold" size="big" disabled={pending || n < 3}>
            {pending ? 'Un momento…' : label}
          </Button>
          {n < 3 && <p className="muted">Il faut au moins 3 joueurs ({3 - n} de plus).</p>}
        </form>
      ) : (
        <p className={styles.waiting}>
          En attente de <strong>{host?.name ?? "l'hôte"}</strong> {waiting}
        </p>
      )}
      {children}
    </div>
  );
}
