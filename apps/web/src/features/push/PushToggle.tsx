'use client';

import { useEffect, useState, useTransition } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { enablePush, pushStatus, type PushStatus } from './push-client';
import styles from './PushToggle.module.css';

/** Active les notifications « à vous de jouer » quand la page n'est pas affichée. */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    pushStatus().then(setStatus, () => setStatus('unsupported'));
  }, []);

  if (status === null || status === 'unsupported') return null;

  const enable = () =>
    startTransition(async () => {
      setError(null);
      try {
        setStatus(await enablePush());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <div className={compact ? `${styles.push} ${styles.compact}` : styles.push}>
      {status === 'on' && (
        <p className={styles.on}>🔔 Notifications activées : on vous prévient quand c&apos;est votre tour.</p>
      )}
      {status === 'off' && (
        <Button size="small" onClick={enable} disabled={pending}>
          🔔 Me prévenir quand c&apos;est mon tour
        </Button>
      )}
      {status === 'denied' && (
        <p className="muted small">🔕 Notifications bloquées : autorisez-les dans les réglages du navigateur.</p>
      )}
      {status === 'ios-install' && (
        <p className="muted small">
          🔔 Sur iPhone, pour être prévenu quand c&apos;est votre tour : touchez <strong>Partager</strong> puis{' '}
          <strong>Sur l&apos;écran d&apos;accueil</strong>, puis ouvrez le jeu depuis l&apos;icône.
        </p>
      )}
      {error && <Alert className="small">{error}</Alert>}
    </div>
  );
}
