'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useSyncExternalStore } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { Field } from '@/components/Field/Field';
import { Panel } from '@/components/Panel/Panel';
import { api, read } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { SignInButton } from '../auth/SignIn';
import styles from './Home.module.css';

const CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const noop = () => () => {};

export function HomeForms() {
  const router = useRouter();
  const session = authClient.useSession();
  // Arrivée depuis une table inexistante ou fermée : un seul message, sans détail.
  const unknownTable = useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get('table') === 'inconnue',
    () => false,
  );
  const notice = unknownTable ? "Cette table n'existe pas." : null;
  useEffect(() => {
    if (unknownTable) window.history.replaceState(null, '', '/');
  }, [unknownTable]);

  const [createError, create, creating] = useActionState(async (_prev: string | null, data: FormData) => {
    const r = await read<{ code: string }>(api.tables.$post({ json: { name: String(data.get('name') ?? '').trim() } }));
    if (!r.ok) return r.error.message;
    router.push(`/t/${r.value.code}`);
    return null;
  }, null);

  const [joinError, join] = useActionState(async (_prev: string | null, data: FormData) => {
    const code = String(data.get('code') ?? '')
      .trim()
      .toUpperCase();
    if (!CODE.test(code)) return 'Entrez le code de la table (5 caractères).';
    router.push(`/t/${code}`);
    return null;
  }, null);

  return (
    <>
      {notice && <Alert>{notice}</Alert>}
      <div className={styles.forms}>
        <Panel as="form" className={styles.form} action={create}>
          <h2 className="title-rye">Nueva mesa</h2>
          <p className="muted">Créez une table et invitez vos amis avec un lien.</p>
          {createError && <Alert>{createError}</Alert>}
          {session.isPending ? (
            <p className="muted">…</p>
          ) : session.data ? (
            <>
              <Field
                label="Votre nom à la table"
                name="name"
                defaultValue={session.data.user.name.slice(0, 20)}
                maxLength={20}
                placeholder="Pancho"
                autoComplete="name"
                required
              />
              <Button type="submit" block disabled={creating}>
                {creating ? 'Création…' : 'Créer une table'}
              </Button>
            </>
          ) : (
            <>
              <p className="muted small">
                Un compte est nécessaire pour jouer et discuter (pas de pseudonyme anonyme).
              </p>
              <SignInButton />
            </>
          )}
        </Panel>

        <Panel as="form" className={styles.form} action={join}>
          <h2 className="title-rye">Unirse</h2>
          <p className="muted">Vous avez reçu un code ? Rejoignez la table.</p>
          {joinError && <Alert>{joinError}</Alert>}
          <Field
            label="Code de la table"
            name="code"
            code
            maxLength={5}
            placeholder="ABCDE"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <Button type="submit" variant="gold" block>
            Rejoindre
          </Button>
        </Panel>
      </div>
      {session.data && (
        <p className={styles.account}>
          Connecté : <strong>{session.data.user.name}</strong> ·{' '}
          <button type="button" className={styles.signOut} onClick={() => void authClient.signOut()}>
            Se déconnecter
          </button>
        </p>
      )}
    </>
  );
}
