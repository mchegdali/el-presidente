import { createMiddleware } from 'hono/factory';
import type { Auth } from './auth';
import { Unauthorized } from '../../shared/errors';
import { fail } from '../../shared/http';

export interface CurrentUser {
  id: string;
  name: string;
  image: string | null;
}

export type AuthVariables = { user: CurrentUser | null };

export async function userFromHeaders(auth: Auth, headers: Headers): Promise<CurrentUser | null> {
  const s = await auth.api.getSession({ headers });
  return s === null ? null : { id: s.user.id, name: s.user.name, image: s.user.image ?? null };
}

/** Pose `c.var.user` (null si pas de session). */
export const sessionMiddleware = (auth: Auth) =>
  createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    c.set('user', await userFromHeaders(auth, c.req.raw.headers));
    await next();
  });

/** Refuse la requête sans session. */
export const requireUser = createMiddleware<{ Variables: AuthVariables & { me: CurrentUser } }>(async (c, next) => {
  const user = c.get('user');
  if (user === null) return fail(c, new Unauthorized({ message: 'Connectez-vous pour continuer.' }));
  c.set('me', user);
  await next();
});
