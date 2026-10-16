'use client';

import type { ChatMessage } from '@el-presidente/game/protocol';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, read } from '@/lib/api';
import { useTableContext } from '../table/context';
import { chatKey, mergeMessages } from './keys';
import { mentions } from './mentions';

/**
 * Messages de la table : l'historique est chargé une fois (JSON construit par Postgres),
 * puis les nouveaux arrivent par la socket et sont fusionnés dans le même cache.
 */
export function useChat(): ChatMessage[] {
  const { table } = useTableContext();
  const { data } = useQuery({
    queryKey: chatKey(table.code),
    queryFn: async ({ client }) => {
      const r = await read<ChatMessage[]>(
        api.tables[':code'].messages.$get({ param: { code: table.code }, query: {} }),
      );
      if (!r.ok) throw new Error(r.error.message);
      return mergeMessages(client.getQueryData(chatKey(table.code)), r.value);
    },
  });
  return data ?? [];
}

/** Messages non lus et mentions, pour le bouton du chat. */
export function useUnread(messages: ChatMessage[], myId: string, myName: string | undefined, open: boolean) {
  const lastId = messages.at(-1)?.id ?? 0;
  const [readUpTo, setReadUpTo] = useState(lastId);
  // Chat ouvert : tout ce qui arrive est lu (mise à jour pendant le rendu, sans effet).
  if (open && readUpTo !== lastId) setReadUpTo(lastId);
  const unread = messages.filter((m) => m.id > readUpTo && m.p !== myId);
  return { count: unread.length, mentioned: unread.some((m) => mentions(m.body, myName)) };
}

/** Vibration à l'arrivée d'un message qui me mentionne. */
export function useMentionBuzz(messages: ChatMessage[], myId: string, myName: string | undefined) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const last = messages.at(-1)?.id ?? 0;
    if (seen.current !== null && myName !== undefined) {
      const fresh = messages.filter((m) => m.id > (seen.current ?? 0) && m.p !== myId);
      if (fresh.some((m) => mentions(m.body, myName))) navigator.vibrate?.([60, 40, 60]);
    }
    seen.current = last;
  }, [messages, myId, myName]);
}
