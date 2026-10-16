'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/Card';
import { Logo, PapelPicado } from '@/components/Decor';
import Rules from '@/components/Rules';
import { getSavedName, getToken, saveName } from '@/lib/identity';
import { call } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(getSavedName()), []);

  // Arrivée depuis une table inexistante ou fermée : un seul message, sans détail.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('table') === 'inconnue') {
      setError("Cette table n'existe pas.");
      window.history.replaceState(null, '', '/');
    }
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const state = await call('create_lobby', { p_token: getToken(), p_name: name });
      saveName(name);
      router.push(`/t/${state.lobby.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 5) {
      setError('Entrez le code de la table (5 caractères).');
      return;
    }
    router.push(`/t/${c}`);
  };

  return (
    <>
      <PapelPicado />
      <main className="page home">
        <header className="hero">
          <Logo size={110} />
          <h1 className="hero__title title-rye">El Presidente</h1>
          <p className="hero__tagline">Le jeu du Président, à la mexicaine. ¡Ándale!</p>
          <div className="hero__fan" aria-hidden="true">
            {['QC', 'KH', '2S', 'JD'].map((c, i) => (
              <Card key={c} card={c} className={`hero__card hero__card--${i}`} />
            ))}
          </div>
        </header>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="home__forms">
          <form className="panel" onSubmit={create}>
            <h2 className="title-rye">Nueva mesa</h2>
            <p className="muted">Créez une table et invitez vos amis avec un lien.</p>
            <label className="field">
              <span>Votre nom</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="Pancho"
                autoComplete="nickname"
                required
              />
            </label>
            <button type="submit" className="btn btn--block" disabled={busy || !name.trim()}>
              {busy ? 'Création…' : 'Créer une table'}
            </button>
          </form>

          <form className="panel" onSubmit={join}>
            <h2 className="title-rye">Unirse</h2>
            <p className="muted">Vous avez reçu un code ? Rejoignez la table.</p>
            <label className="field">
              <span>Code de la table</span>
              <input
                className="input input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={5}
                placeholder="ABCDE"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn btn--gold btn--block">
              Rejoindre
            </button>
          </form>
        </div>

        <Rules />
        <p className="home__footer">
          <Link href="/cartes">Voir toutes les cartes</Link>
        </p>
      </main>
    </>
  );
}
