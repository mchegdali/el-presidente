import { GameRuleError } from '@el-presidente/game';
import { Result } from 'better-result';
import { notMember, type Forbidden } from '../../../shared/errors';
import type { Table } from '../../tables/shared/table';

/** Siège du joueur dans la manche en cours. */
export function seatInRound(table: Table, userId: string): Result<number, Forbidden | GameRuleError> {
  const seat = table.seatOf(userId);
  if (seat < 0) return Result.err(notMember());
  if (table.game === null || seat >= table.game.n) {
    return Result.err(new GameRuleError({ reason: 'no_round', message: 'Aucune manche en cours.' }));
  }
  return Result.ok(seat);
}
