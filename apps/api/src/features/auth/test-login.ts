// Connexion de test, sans Google : banc de charge et tests de bout en bout.
// Montée seulement si ENABLE_TEST_LOGIN (refusé en production par shared/env.ts).

import { z } from 'zod';
import { router, validJson } from '../../shared/hono';
import type { Auth } from './auth';

interface TestContext {
  test: {
    createUser(o: Record<string, unknown>): { id: string };
    saveUser(u: unknown): Promise<{ id: string }>;
    login(o: { userId: string }): Promise<{ headers: Headers; cookies: { name: string; value: string }[] }>;
  };
}

export const testLoginRoute = (auth: Auth) =>
  router().post('/login', validJson(z.object({ name: z.string().min(1).max(40) })), async (c) => {
    const ctx = (await auth.$context) as unknown as TestContext;
    const { name } = c.req.valid('json');
    const user = await ctx.test.saveUser(
      ctx.test.createUser({ name, email: `${crypto.randomUUID()}@test.invalid`, emailVerified: true }),
    );
    const { headers } = await ctx.test.login({ userId: user.id });
    const cookie = headers.get('cookie') ?? '';
    return c.json({ userId: user.id, cookie }, 200);
  });
