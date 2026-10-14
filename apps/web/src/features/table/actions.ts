// Actions HTTP sur une table (froides : rejoindre, régler, lancer…). L'API renvoie l'état
// complet ; les autres joueurs le reçoivent par la socket.

import type { TableSnapshot } from '@el-presidente/game/protocol';
import { api, read } from '@/lib/api';

export type ActionResult = { ok: true } | { ok: false; message: string };

async function snapshotAction(
  res: ReturnType<typeof read<TableSnapshot>>,
  accept: (s: TableSnapshot) => void,
): Promise<ActionResult> {
  const r = await res;
  if (!r.ok) return { ok: false, message: r.error.message };
  accept(r.value);
  return { ok: true };
}

export const tableActions = (code: string, accept: (s: TableSnapshot) => void) => ({
  join: (name?: string) =>
    snapshotAction(
      read<TableSnapshot>(api.tables[':code'].join.$post({ param: { code }, json: name ? { name } : {} })),
      accept,
    ),
  start: () => snapshotAction(read<TableSnapshot>(api.tables[':code'].rounds.$post({ param: { code } })), accept),
  cancel: () =>
    snapshotAction(read<TableSnapshot>(api.tables[':code'].rounds.current.$delete({ param: { code } })), accept),
  kick: (userId: string) =>
    snapshotAction(read<TableSnapshot>(api.tables[':code'].kick.$post({ param: { code }, json: { userId } })), accept),
  setTurnLimit: (turnLimit: number) =>
    snapshotAction(
      read<TableSnapshot>(api.tables[':code'].settings.$patch({ param: { code }, json: { turnLimit } })),
      accept,
    ),
  async leave(): Promise<ActionResult> {
    const r = await read(api.tables[':code'].leave.$post({ param: { code } }));
    return r.ok ? { ok: true } : { ok: false, message: r.error.message };
  },
});

export type TableActions = ReturnType<typeof tableActions>;
