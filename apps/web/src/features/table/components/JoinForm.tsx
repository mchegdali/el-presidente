'use client';

import type { TableSnapshot } from '@el-presidente/game/protocol';
import Link from 'next/link';
import { useActionState } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { Logo, PapelPicado } from '@/components/Decor/Decor';
import { Field } from '@/components/Field/Field';
import { Page } from '@/components/Page/Page';
import { Panel } from '@/components/Panel/Panel';
import { authClient } from '@/lib/auth-client';
import { SignInButton } from '../../auth/SignIn';
import type { TableActions } from '../actions';
import styles from './JoinForm.module.css';

/** Visiteur d'une table : se connecter, puis prendre place. */
export function JoinForm({ table, actions }: { table: TableSnapshot; actions: TableActions }) {
  const session = authClient.useSession();
  const inRound = table.status === 'playing' || table.status === 'exchange';
  const full = table.players.length >= 8;
  const [error, join, pending] = useActionState(async (_prev: string | null, data: FormData) => {
    const r = await actions.join(String(data.get('name') ?? '').trim() || undefined);
    return r.ok ? null : r.message;
  }, null);

  return (
    <>
      <PapelPicado />
      <Page centered>
        <Panel as="form" narrow className={styles.join} action={join}>
          <Logo size={80} />
          <h1 className="title-rye">¡Bienvenido!</h1>
          <p>
            Table <strong className="code">{table.code}</strong>
            {table.players.length > 0 && <> — avec {table.players.map((p) => p.name).join(', ')}</>}
          </p>
          {inRound && (
            <Alert tone="notice">Une manche est en cours : vous pourrez entrer dès qu&apos;elle sera terminée.</Alert>
          )}
          {full && <Alert tone="notice">La table est complète (8 joueurs maximum).</Alert>}
          {error && <Alert>{error}</Alert>}
          {session.isPending ? null : session.data ? (
            <>
              <Field
                label="Votre nom à la table"
                name="name"
                defaultValue={session.data.user.name.slice(0, 20)}
                maxLength={20}
                autoComplete="name"
                required
              />
              <Button type="submit" block disabled={pending || inRound || full}>
                {pending ? 'Un momento…' : 'Prendre place'}
              </Button>
            </>
          ) : (
            <>
              <p className="muted">Connectez-vous pour jouer et discuter avec la table.</p>
              <SignInButton />
            </>
          )}
          <Link href="/" className={styles.home}>
            ← Accueil
          </Link>
        </Panel>
      </Page>
    </>
  );
}
