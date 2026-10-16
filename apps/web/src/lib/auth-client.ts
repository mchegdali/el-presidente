import { createAuthClient } from 'better-auth/react';
import { API_URL } from './config';

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
});

/** Connexion Google, retour sur la page courante (ou `returnTo`). */
export function signInWithGoogle(returnTo?: string) {
  return authClient.signIn.social({ provider: 'google', callbackURL: returnTo ?? window.location.href });
}
