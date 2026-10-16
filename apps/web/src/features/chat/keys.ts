import type { ChatMessage } from '@el-presidente/game/protocol';

export const chatKey = (code: string) => ['chat', code] as const;

/** Ajoute des messages à l'historique, sans doublon, dans l'ordre. */
export function mergeMessages(current: ChatMessage[] | undefined, incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map((current ?? []).map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-200);
}
