'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { signInAsGuest, signInWithGoogle } from '@/lib/auth-client';
import styles from './SignIn.module.css';

/** Connexion Google. */
export function SignInButton({ label = 'Se connecter avec Google', returnTo }: { label?: string; returnTo?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="gold"
      block
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signInWithGoogle(returnTo);
        })
      }
    >
      {pending ? 'Redirection…' : label}
    </Button>
  );
}

/** Google ou invité : les deux mènent à la table ; l'invité peut garder son compte plus tard. */
export function SignInChoice() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.choice}>
      <SignInButton />
      <Button
        variant="green"
        block
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await signInAsGuest();
            if (r.error) setError(r.error.message ?? 'Connexion impossible, réessayez.');
          })
        }
      >
        {pending ? 'Un momento…' : 'Jouer sans compte'}
      </Button>
      {error && <Alert>{error}</Alert>}
      <p className="muted small">
        Sans compte, vous jouez en invité sur cet appareil ; vous pourrez garder votre place en vous connectant avec
        Google.
      </p>
    </div>
  );
}

/** Invité : rattacher ses places et ses messages à un compte Google. */
export function KeepAccountButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signInWithGoogle();
        })
      }
    >
      {pending ? 'Redirection…' : 'Garder mon compte avec Google'}
    </button>
  );
}
