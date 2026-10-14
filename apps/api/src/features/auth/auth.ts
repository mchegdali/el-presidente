import { schema, type Database } from '@el-presidente/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { testUtils } from 'better-auth/plugins';
import type { Env } from '../../shared/env';

export function createAuth(db: Database, env: Env) {
  const secure = env.API_ORIGIN.startsWith('https://');
  return betterAuth({
    appName: 'El Presidente',
    baseURL: env.API_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
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
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Session signée dans un cookie : pas de lecture en base à chaque requête.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: env.NODE_ENV === 'production', storage: 'memory' },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure },
      crossSubDomainCookies: env.COOKIE_DOMAIN ? { enabled: true, domain: env.COOKIE_DOMAIN } : undefined,
      ipAddress: { ipAddressHeaders: env.TRUST_PROXY ? ['x-real-ip'] : [] },
    },
    // Aides de test (création de sessions sans Google) : jamais en production.
    plugins: env.ENABLE_TEST_LOGIN || env.NODE_ENV === 'test' ? [testUtils()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
