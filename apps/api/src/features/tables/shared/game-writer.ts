// Écriture différée et groupée des manches (« group commit » applicatif).
//
// L'état autoritaire d'une manche est en mémoire. Chaque coup marque la table « à
// écrire » ; toutes les ~10 ms (ou dès 64 tables en attente), une seule transaction
// écrit la dernière version de chaque table, avec `synchronous_commit = off` : au pire
// quelques centaines de millisecondes perdues si le serveur tombe, jamais de corruption.
// Plusieurs coups sur une même table entre deux écritures ne coûtent qu'une ligne.
// La colonne `version` empêche une écriture en retard d'écraser une plus récente.

import { toSnapshot, type GameSnapshot } from '@el-presidente/game';
import { schema, type Database } from '@el-presidente/db';
import { sql } from '@el-presidente/db';
import { log } from '../../../shared/logger';
import type { Table } from './table';

const { games } = schema;

interface Pending {
  lobbyId: string;
  roundNo: number;
  version: number;
  state: GameSnapshot;
  deadlineAt: Date | null;
}

export class GameWriter {
  private pending = new Map<string, Pending>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private failures = 0;

  constructor(
    private readonly db: Database,
    private readonly delayMs = 10,
    private readonly batch = 64,
  ) {}

  get size(): number {
    return this.pending.size;
  }

  /** Marque la manche de la table à écrire (copie de l'état au moment de l'appel). */
  save(table: Table): void {
    if (table.game === null) return;
    const deadline = table.deadline();
    this.pending.set(table.id, {
      lobbyId: table.id,
      roundNo: table.game.roundNo,
      version: table.version,
      state: structuredClone(toSnapshot(table.game)),
      deadlineAt: deadline === null ? null : new Date(deadline),
    });
    if (this.pending.size >= this.batch) void this.flush();
    else this.timer ??= setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Oublie une écriture en attente (manche supprimée). */
  drop(lobbyId: string): void {
    this.pending.delete(lobbyId);
  }

  isPending(lobbyId: string): boolean {
    return this.pending.has(lobbyId);
  }

  /** Écrit tout ce qui est en attente ; renvoie quand c'est fait. */
  async flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    while (this.flushing !== null) await this.flushing;
    if (this.pending.size === 0) return;
    const rows = [...this.pending.values()];
    this.pending.clear();
    this.flushing = this.write(rows).finally(() => {
      this.flushing = null;
    });
    await this.flushing;
  }

  private async write(rows: Pending[]): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`set local synchronous_commit = off`);
        await tx
          .insert(games)
          .values(rows)
          .onConflictDoUpdate({
            target: games.lobbyId,
            set: {
              roundNo: sql`excluded.round_no`,
              version: sql`excluded.version`,
              state: sql`excluded.state`,
              deadlineAt: sql`excluded.deadline_at`,
              updatedAt: sql`now()`,
            },
            setWhere: sql`${games.version} < excluded.version`,
          });
      });
      this.failures = 0;
    } catch (error) {
      // On remet en file ce qui n'a pas été remplacé entre-temps, et on réessaie.
      for (const r of rows) if (!this.pending.has(r.lobbyId)) this.pending.set(r.lobbyId, r);
      this.failures++;
      log.error('écriture des manches', { error: String(error), rows: rows.length, failures: this.failures });
      this.timer ??= setTimeout(() => void this.flush(), Math.min(5000, 50 * 2 ** this.failures));
    }
  }
}
