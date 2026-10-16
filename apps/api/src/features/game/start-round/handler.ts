import { startRound as deal, toSnapshot } from '@el-presidente/game';
import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { Conflict, dbError, hostOnly, notMember, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { notifyTurn } from '../../push/notify-turn';
import { lobbyChanged } from '../../tables/shared/lobby-changed';
import { snapshotFor } from '../../tables/shared/snapshot';
import type { Table } from '../../tables/shared/table';

const { games, lobbies } = schema;

export async function startRound(deps: Deps, table: Table, user: CurrentUser) {
  return table.exclusive(async (): Promise<Result<ReturnType<typeof snapshotFor>, AppError>> => {
    if (table.seatOf(user.id) < 0) return Result.err(notMember());
    if (table.hostId !== user.id) return Result.err(hostOnly('lancer la manche'));
    if (table.roundActive) return Result.err(new Conflict({ message: 'Une manche est déjà en cours.' }));

    const now = deps.now();
    const dealt = deal({
      players: table.players.length,
      roundNo: table.roundNo + 1,
      roles: table.players.map((p) => p.role),
      rng: deps.rng,
      now,
    });
    if (dealt.isErr()) return Result.err(dealt.error);
    const { state } = dealt.value;
    const status = state.phase === 'exchange' ? ('exchange' as const) : ('playing' as const);
    const version = table.version + 1;
    const deadline = table.turnLimit === null ? null : new Date(now + table.turnLimit * 1000);

    // La nouvelle manche est écrite avant d'être visible : pas de manche fantôme.
    deps.writer.drop(table.id);
    const saved = await Result.tryPromise({
      try: () =>
        deps.db.transaction(async (tx) => {
          const row = { roundNo: state.roundNo, version, state: toSnapshot(state), deadlineAt: deadline };
          await tx
            .insert(games)
            .values({ lobbyId: table.id, ...row })
            .onConflictDoUpdate({ target: games.lobbyId, set: row });
          await tx
            .update(lobbies)
            .set({ status, roundNo: state.roundNo, notice: null })
            .where(eq(lobbies.id, table.id));
        }),
      catch: dbError,
    });
    if (saved.isErr()) return Result.err(saved.error);

    table.game = state;
    table.status = status;
    table.roundNo = state.roundNo;
    table.notice = null;
    table.notified.clear();
    table.version = version - 1; // lobbyChanged incrémente
    lobbyChanged(deps, table);
    notifyTurn(deps, table);
    return Result.ok(snapshotFor(table, user.id, deps.now()));
  });
}
