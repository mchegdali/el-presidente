import { playCards as applyPlay } from '@el-presidente/game';
import { Result } from 'better-result';
import type { Deps } from '../../../shared/deps';
import type { AppError } from '../../../shared/errors';
import type { Table } from '../../tables/shared/table';
import { commitMove } from '../shared/commit';
import { seatInRound } from '../shared/seat';

export function playCards(deps: Deps, table: Table, userId: string, cards: number[]): Result<void, AppError> {
  return Result.gen(function* () {
    const seat = yield* seatInRound(table, userId);
    const events = yield* applyPlay(table.game!, seat, cards, deps.now());
    commitMove(deps, table, { kind: 'play', seat, cards, count: cards.length }, events);
    return Result.ok();
  });
}
