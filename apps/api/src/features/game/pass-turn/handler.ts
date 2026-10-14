import { passTurn as applyPass } from '@el-presidente/game';
import { Result } from 'better-result';
import type { Deps } from '../../../shared/deps';
import type { AppError } from '../../../shared/errors';
import type { Table } from '../../tables/shared/table';
import { commitMove } from '../shared/commit';
import { seatInRound } from '../shared/seat';

export function passTurn(deps: Deps, table: Table, userId: string): Result<void, AppError> {
  return Result.gen(function* () {
    const seat = yield* seatInRound(table, userId);
    const events = yield* applyPass(table.game!, seat, deps.now());
    commitMove(deps, table, { kind: 'pass', seat, cards: null, count: 0 }, events);
    return Result.ok();
  });
}
