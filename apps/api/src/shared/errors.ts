import { GameRuleError } from '@el-presidente/game';
import { TaggedError } from 'better-result';

export { GameRuleError };

export class Unauthorized extends TaggedError('Unauthorized')<{ message: string }> {}
export class Forbidden extends TaggedError('Forbidden')<{ message: string }> {}
export class NotFound extends TaggedError('NotFound')<{ message: string }> {}
export class Conflict extends TaggedError('Conflict')<{ message: string }> {}
export class Invalid extends TaggedError('Invalid')<{ message: string }> {}
export class RateLimited extends TaggedError('RateLimited')<{ message: string; retryAfter: number }> {}
export class Unavailable extends TaggedError('Unavailable')<{ message: string; retryAfter: number }> {}
export class DbError extends TaggedError('DbError')<{ message: string; cause: unknown }> {}

export type AppError =
  | GameRuleError
  | Unauthorized
  | Forbidden
  | NotFound
  | Conflict
  | Invalid
  | RateLimited
  | Unavailable
  | DbError;

/** Message volontairement unique : on ne dit pas si la table a existé. */
export const tableNotFound = () => new NotFound({ message: "Cette table n'existe pas." });
export const notMember = () => new Forbidden({ message: 'Vous ne faites pas partie de cette table.' });
export const hostOnly = (action: string) => new Forbidden({ message: `Seul le créateur de la table peut ${action}.` });
export const dbError = (cause: unknown) => new DbError({ message: 'Service momentanément indisponible.', cause });
