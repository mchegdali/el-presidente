import { createAuthClient } from 'better-auth/react';
import { anonymousClient } from 'better-auth/client/plugins';
import { API_URL } from './config';

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
  plugins: [anonymousClient()],
});

/**
 * Connexion Google, retour sur la page courante (ou `returnTo`). Depuis un compte invité,
 * l'API rattache ses places et ses messages au compte Google.
 */
export function signInWithGoogle(returnTo?: string) {
  return authClient.signIn.social({ provider: 'google', callbackURL: returnTo ?? window.location.href });
}

/** Compte invité : pseudo seulement, sans Google. */
export const signInAsGuest = () => authClient.signIn.anonymous();
