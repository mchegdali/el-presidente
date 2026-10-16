'use client';

import { useEffect, useState } from 'react';
import { enablePush, pushStatus, type PushStatus } from '@/lib/push';
import type { TableState } from '@/lib/types';
import type { TableApi } from './TableRoom';

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
export function TurnLimitSetting({ state, table }: { state: TableState; table: TableApi }) {
  const isHost = state.lobby.host_id === state.me;
  const limit = state.lobby.turn_limit ?? 0;
  if (!isHost) {
    return (
      <p className="setting muted">
        ⏱ Passe automatique : <strong>{turnLimitLabel(state.lobby.turn_limit)}</strong>
      </p>
    );
  }
  return (
    <label className="setting">
      <span>⏱ Passe automatique après</span>
      <select
        className="input setting__select"
        value={limit}
        disabled={table.busy}
        onChange={(e) => table.act('set_turn_limit', { p_seconds: Number(e.target.value) })}
      >
        {TURN_LIMITS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
        {!TURN_LIMITS.some((t) => t.value === limit) && <option value={limit}>{limit} s</option>}
      </select>
    </label>
  );
}

/** Active les notifications « à vous de jouer » quand la page n'est pas affichée. */
export function PushToggle({ code, compact = false }: { code: string; compact?: boolean }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushStatus().then(setStatus, () => setStatus('unsupported'));
  }, []);

  if (!status || status === 'unsupported') return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await enablePush(code));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`push ${compact ? 'push--compact' : ''}`}>
      {status === 'on' && <p className="push__on">🔔 Notifications activées : on vous prévient quand c&apos;est votre tour.</p>}
      {status === 'off' && (
        <button type="button" className="btn btn--small" onClick={enable} disabled={busy}>
          🔔 Me prévenir quand c&apos;est mon tour
        </button>
      )}
      {status === 'denied' && (
        <p className="muted small">🔕 Notifications bloquées : autorisez-les dans les réglages du navigateur.</p>
      )}
      {status === 'ios-install' && (
        <p className="muted small">
          🔔 Sur iPhone, pour être prévenu quand c&apos;est votre tour : touchez <strong>Partager</strong> puis{' '}
          <strong>Sur l&apos;écran d&apos;accueil</strong>, ouvrez le jeu depuis l&apos;icône et rejoignez la table
          depuis celle-ci.
        </p>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
