import { schema } from '@el-presidente/db';
import type { ChatMessage } from '@el-presidente/game/protocol';
import { Result } from 'better-result';
import type { Deps } from '../../../shared/deps';
import { dbError, Invalid, notMember, RateLimited, type AppError } from '../../../shared/errors';
import { RateLimiter } from '../../../shared/rate-limit';
import type { Table } from '../../tables/shared/table';

const { messages } = schema;
export const MAX_MESSAGE_LENGTH = 300;

// 4 messages par 5 secondes et par joueur.
export const chatLimiter = new RateLimiter(4, 4 / 5);

export async function sendMessage(
  deps: Deps,
  table: Table,
  userId: string,
  rawBody: string,
  ip: string | null,
): Promise<Result<ChatMessage, AppError>> {
  const seat = table.seatOf(userId);
  if (seat < 0) return Result.err(notMember());
  const body = rawBody.trim();
  if (body.length === 0) return Result.err(new Invalid({ message: 'Message vide.' }));
  if ([...body].length > MAX_MESSAGE_LENGTH) {
    return Result.err(new Invalid({ message: `Message trop long (${MAX_MESSAGE_LENGTH} caractères max).` }));
  }
  const wait = chatLimiter.take(`${table.id}:${userId}`, deps.now());
  if (wait > 0) {
    return Result.err(
      new RateLimited({ message: "Doucement ! Attendez un peu avant d'envoyer un autre message.", retryAfter: wait }),
    );
  }
  const name = table.players[seat]!.name;
  const inserted = await Result.tryPromise({
    try: () =>
      deps.db
        .insert(messages)
        .values({ lobbyId: table.id, userId, name, body, ip })
        .returning({ id: messages.id, at: messages.createdAt }),
    catch: dbError,
  });
  if (inserted.isErr()) return Result.err(inserted.error);
  const row = inserted.value[0]!;
  const message: ChatMessage = { id: row.id, p: userId, name, body, at: row.at.getTime() };
  table.chatLast = row.id;
  table.lastActivity = deps.now();
  deps.hub.publishMembers(table, { op: 'chat', message });

  // @mention : les joueurs mentionnés dont aucun onglet n'est au premier plan.
  const lower = body.toLowerCase();
  for (const p of table.players) {
    if (p.userId === userId || table.isOnline(p.userId) || !lower.includes(`@${p.name.toLowerCase()}`)) continue;
    deps.push.send(p.userId, { title: `${name} vous mentionne`, body: body.slice(0, 140), url: `/t/${table.code}` });
  }
  return Result.ok(message);
}
