'use client';

// Connexion à une table : état dans le cache TanStack Query (mis à jour par la socket),
// fonctions d'action, horloge du serveur.

import type { ClientMessage, TableSnapshot } from '@el-presidente/game/protocol';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, read } from '@/lib/api';
import { chatKey, mergeMessages } from '../../chat/keys';
import { TableSocket, type RequestResult } from './socket';
import { reduceTable } from './store';

export const tableKey = (code: string) => ['table', code] as const;
export const UNKNOWN_TABLE_URL = '/?table=inconnue';

export interface TableConnection {
  table: TableSnapshot | undefined;
  live: boolean;
  /** Heure du serveur (ms), d'après le décalage mesuré au dernier état complet. */
  serverNow: () => number;
  request: (msg: Extract<ClientMessage, { req: number }>) => Promise<RequestResult>;
  send: (msg: ClientMessage) => void;
  /** Applique un état complet renvoyé par une action HTTP (s'il n'est pas plus ancien). */
  accept: (snapshot: TableSnapshot) => void;
}

export function useTable(code: string): TableConnection {
  const client = useQueryClient();
  const router = useRouter();
  const [live, setLive] = useState(false);
  const offset = useRef(0);
  const socket = useRef<TableSocket | null>(null);
  const { data: table } = useQuery<TableSnapshot>({ queryKey: tableKey(code), queryFn: skipToken });

  useEffect(() => {
    const s = new TableSocket(code, {
      message(msg) {
        if (msg.op === 'snapshot') offset.current = msg.snapshot.now - Date.now();
        if (msg.op === 'chat') {
          client.setQueryData(chatKey(code), (cur: Parameters<typeof mergeMessages>[0]) =>
            mergeMessages(cur, [msg.message]),
          );
        }
        if (msg.op === 'fatal') return;
        const next = reduceTable(client.getQueryData(tableKey(code)), msg);
        if (next === 'resync') s.send({ op: 'sync' });
        else if (next !== undefined) client.setQueryData(tableKey(code), next);
      },
      status: setLive,
      async failed(attempts) {
        // Connexion refusée d'emblée : la table existe-t-elle ?
        if (attempts !== 1 && attempts !== 4) return;
        const r = await read(api.tables[':code'].$get({ param: { code } }));
        if (!r.ok && r.status === 404) router.replace(UNKNOWN_TABLE_URL);
      },
    });
    socket.current = s;
    s.start();
    return () => {
      s.stop();
      socket.current = null;
    };
  }, [client, code, router]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  const request = useCallback<TableConnection['request']>(
    (msg) => socket.current?.request(msg) ?? Promise.resolve({ ok: false, message: 'Pas de connexion.' }),
    [],
  );
  const send = useCallback((msg: ClientMessage) => void socket.current?.send(msg), []);
  const accept = useCallback(
    (snapshot: TableSnapshot) => {
      const cur = client.getQueryData<TableSnapshot>(tableKey(code));
      if (cur === undefined || snapshot.version >= cur.version) client.setQueryData(tableKey(code), snapshot);
    },
    [client, code],
  );

  return { table, live, serverNow, request, send, accept };
}
