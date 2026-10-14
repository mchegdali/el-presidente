'use client';

import { useTransition } from 'react';
import { Button } from '@/components/Button/Button';
import { signInWithGoogle } from '@/lib/auth-client';

/** Connexion Google : obligatoire pour jouer et discuter (auteur identifié des messages). */
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
