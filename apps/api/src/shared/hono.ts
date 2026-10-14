import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { z } from 'zod';
import type { AuthVariables, CurrentUser } from '../features/auth/session';
import { Invalid } from './errors';
import { fail } from './http';

export type AppEnv = { Variables: AuthVariables & { me: CurrentUser; ip: string | null } };

export const router = () => new Hono<AppEnv>();

const invalid = (issues: { message: string }[]) => new Invalid({ message: issues[0]?.message ?? 'Requête invalide.' });

/** Validation Zod avec le format d'erreur commun. */
export const validJson = <T extends z.ZodType>(schema: T) =>
  zValidator('json', schema, (r, c) => (r.success ? undefined : fail(c, invalid(r.error.issues))));

export const validQuery = <T extends z.ZodType>(schema: T) =>
  zValidator('query', schema, (r, c) => (r.success ? undefined : fail(c, invalid(r.error.issues))));

export const validParam = <T extends z.ZodType>(schema: T) =>
  zValidator('param', schema, (r, c) => (r.success ? undefined : fail(c, invalid(r.error.issues))));
