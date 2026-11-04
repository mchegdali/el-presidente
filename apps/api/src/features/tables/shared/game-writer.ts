// Écriture différée et groupée des manches (« group commit » applicatif).
//
// L'état autoritaire d'une manche est en mémoire. Chaque coup marque la table « à
// écrire » ; toutes les ~10 ms (ou dès 64 tables en attente), une seule transaction
// écrit la dernière version de chaque table. En WAL avec synchronous = NORMAL, une
// transaction ne coûte pas de fsync : au pire, une coupure de courant perd les toutes
// dernières écritures, jamais de corruption. Plusieurs coups sur une même table entre
// deux écritures ne coûtent qu'une ligne. La colonne `version` empêche une écriture en
// retard d'écraser une plus récente.
//
// SQLite est synchrone (bun:sqlite) : une écriture ne peut pas être « en vol » pendant
// qu'un autre cas d'usage s'exécute.

import { toSnapshot, type GameSnapshot } from '@el-presidente/game';
import { schema } from '@el-presidente/db';
import type { Database } from '@el-presidente/db/types';
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
    if (this.pending.size >= this.batch) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), this.delayMs);
  }

  /** Oublie une écriture en attente (manche supprimée). */
  drop(lobbyId: string): void {
    this.pending.delete(lobbyId);
  }

  isPending(lobbyId: string): boolean {
    return this.pending.has(lobbyId);
  }

  /** Écrit tout ce qui est en attente. */
  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.size === 0) return;
    const rows = [...this.pending.values()];
    this.pending.clear();
    try {
      this.db
        .insert(games)
        .values(rows)
        .onConflictDoUpdate({
          target: games.lobbyId,
          set: {
            roundNo: sql`excluded.round_no`,
            version: sql`excluded.version`,
            state: sql`excluded.state`,
            deadlineAt: sql`excluded.deadline_at`,
            updatedAt: new Date(),
          },
          setWhere: sql`${games.version} < excluded.version`,
        })
        .run();
      this.failures = 0;
    } catch (error) {
      // On remet en file ce qui n'a pas été remplacé entre-temps, et on réessaie.
      for (const r of rows) if (!this.pending.has(r.lobbyId)) this.pending.set(r.lobbyId, r);
      this.failures++;
      log.error('écriture des manches', { error: String(error), rows: rows.length, failures: this.failures });
      this.timer ??= setTimeout(() => this.flush(), Math.min(5000, 50 * 2 ** this.failures));
    }
  }
}
