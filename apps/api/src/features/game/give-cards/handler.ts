import { giveCards as applyGive } from '@el-presidente/game';
import { Result } from 'better-result';
import type { Deps } from '../../../shared/deps';
import type { AppError } from '../../../shared/errors';
import type { Table } from '../../tables/shared/table';
import { commitMove } from '../shared/commit';
import { seatInRound } from '../shared/seat';

export function giveCards(deps: Deps, table: Table, userId: string, cards: number[]): Result<void, AppError> {
  return Result.gen(function* () {
    const seat = yield* seatInRound(table, userId);
    const g = table.game!;
    const to = g.exchanges.find((e) => e.from === seat && !e.done)?.to ?? -1;
    const events = yield* applyGive(g, seat, cards, deps.now());
    commitMove(deps, table, { kind: 'give', seat, to, cards, count: cards.length }, events);
    return Result.ok();
  });
}
