'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSavedName, getToken, saveName } from '@/lib/identity';
import { call } from '@/lib/supabase';
import type { TableState } from '@/lib/types';
import { Logo, PapelPicado } from './Decor';
import type { TableApi } from './TableRoom';

export default function JoinForm({ state, table }: { state: TableState; table: TableApi }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(getSavedName()), []);

  const inRound = state.lobby.status === 'playing' || state.lobby.status === 'exchange';
  const full = state.players.length >= 8;

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await call('join_lobby', { p_code: state.lobby.code, p_token: getToken(), p_name: name });
      saveName(name);
      table.apply(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PapelPicado />
      <main className="page centered">
        <form className="panel narrow join" onSubmit={join}>
          <Logo size={80} />
          <h1 className="title-rye">¡Bienvenido!</h1>
          <p>
            Table <strong className="code">{state.lobby.code}</strong>
            {state.players.length > 0 && (
              <>
                {' '}
                — avec {state.players.map((p) => p.name).join(', ')}
              </>
            )}
          </p>
          {inRound && (
            <p className="notice">Une manche est en cours : vous pourrez entrer dès qu&apos;elle sera terminée.</p>
          )}
          {full && <p className="notice">La table est complète (8 joueurs maximum).</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <label className="field">
            <span>Votre nom</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="Pancho"
              autoComplete="nickname"
              autoFocus
              required
            />
          </label>
          <button type="submit" className="btn btn--block" disabled={busy || !name.trim() || inRound || full}>
            {busy ? 'Un momento…' : 'Prendre place'}
          </button>
          <Link href="/" className="link-back join__home">
            ← Accueil
          </Link>
        </form>
      </main>
    </>
  );
}
