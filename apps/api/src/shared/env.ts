import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().min(1),
    /** Socket Unix d'écoute (derrière HAProxy) ; sinon PORT. */
    LISTEN_UNIX: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
    /** URL publique de l'API (better-auth). */
    API_ORIGIN: z.url(),
    /** Origine du site (Vercel). */
    WEB_ORIGIN: z.url(),
    /** Domaine du cookie de session partagé entre le site et l'API. */
    COOKIE_DOMAIN: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),
    /** Jeton d'accès à /metrics ; sans jeton, /metrics est désactivé. */
    METRICS_TOKEN: z.string().min(16).optional(),
    /** Derrière HAProxy : l'adresse du client vient de X-Forwarded-For. */
    TRUST_PROXY: z.stringbool().default(false),
    /** Connexion de test (/test/login) pour le banc de charge et Playwright. Jamais en production. */
    ENABLE_TEST_LOGIN: z.stringbool().default(false),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.ENABLE_TEST_LOGIN), {
    message: 'ENABLE_TEST_LOGIN est interdit en production',
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    console.error('Configuration invalide :\n' + z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}
