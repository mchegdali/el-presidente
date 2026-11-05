import { schema } from '@el-presidente/db';
import type { Database } from '@el-presidente/db/types';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous, testUtils } from 'better-auth/plugins';
import type { Env } from '../../shared/env';

export interface AuthHooks {
  /** Invité qui se connecte avec Google : ses données passent au compte Google. */
  onLinkGuest?: (guestId: string, user: { id: string; image?: string | null }) => Promise<void>;
}

/** Nom des comptes invités ; le pseudo affiché à la table est choisi en la rejoignant. */
export const GUEST_NAME = 'Invité';

export function createAuth(db: Database, env: Env, hooks: AuthHooks = {}) {
  const secure = env.API_ORIGIN.startsWith('https://');
  return betterAuth({
    appName: 'El Presidente',
    baseURL: env.API_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
      },
    },
    trustedOrigins: [env.WEB_ORIGIN],
    // En test seulement : une connexion sans Google qui passe par better-auth, pour éprouver le
    // rattachement d'un invité (le plugin `anonymous` réagit à toute connexion, Google compris).
    emailAndPassword: { enabled: env.NODE_ENV === 'test' },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Session signée dans un cookie : pas de lecture en base à chaque requête.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: env.NODE_ENV === 'production',
      storage: 'memory',
      // Création d'invités : 10 par heure et par adresse.
      customRules: { '/sign-in/anonymous': { window: 3600, max: 10 } },
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure },
      crossSubDomainCookies: env.COOKIE_DOMAIN ? { enabled: true, domain: env.COOKIE_DOMAIN } : undefined,
      ipAddress: { ipAddressHeaders: env.TRUST_PROXY ? ['x-real-ip'] : [] },
    },
    plugins: [
      anonymous({
        // Adresse technique (la colonne est obligatoire et unique), jamais utilisée.
        emailDomainName: 'invite.invalid',
        generateName: () => GUEST_NAME,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await hooks.onLinkGuest?.(anonymousUser.user.id, { id: newUser.user.id, image: newUser.user.image });
        },
      }),
      // Aides de test (création de sessions sans Google) : jamais en production.
      ...(env.ENABLE_TEST_LOGIN || env.NODE_ENV === 'test' ? [testUtils()] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
