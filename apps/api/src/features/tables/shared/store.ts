// Tables chargées en mémoire. Chargement à la demande (une seule lecture même si
// plusieurs requêtes arrivent ensemble), éviction des tables inactives sans connexion.

import { fromSnapshot } from '@el-presidente/game';
import { schema, type Database } from '@el-presidente/db';
import { Result } from 'better-result';
import { asc, eq, max } from '@el-presidente/db';
import { dbError, tableNotFound, type DbError, type NotFound } from '../../../shared/errors';
import { Table } from './table';

const { lobbies, players, games, messages, user } = schema;

export const normalizeCode = (code: string) => code.trim().toUpperCase();

export class TableStore {
  private tables = new Map<string, Table>();
  private loading = new Map<string, Promise<Result<Table | null, DbError>>>();

  constructor(private readonly db: Database) {}

  /** Table chargée en mémoire, sans lecture en base. */
  cached(code: string): Table | undefined {
    return this.tables.get(normalizeCode(code));
  }

  byId(id: string): Table | undefined {
    for (const t of this.tables.values()) if (t.id === id) return t;
    return undefined;
  }

  all(): IterableIterator<Table> {
    return this.tables.values();
  }

  add(table: Table): void {
    this.tables.set(table.code, table);
  }

  remove(table: Table): void {
    if (this.tables.get(table.code) === table) this.tables.delete(table.code);
  }

  async get(code: string): Promise<Result<Table, NotFound | DbError>> {
    const key = normalizeCode(code);
    if (!/^[A-Z0-9]{4,8}$/.test(key)) return Result.err(tableNotFound());
    const hit = this.tables.get(key);
    if (hit !== undefined) return Result.ok(hit);
    let pending = this.loading.get(key);
    if (pending === undefined) {
      pending = this.load(key).finally(() => this.loading.delete(key));
      this.loading.set(key, pending);
    }
    const loaded = await pending;
    if (loaded.isErr()) return Result.err(loaded.error);
    if (loaded.value === null) return Result.err(tableNotFound());
    return Result.ok(loaded.value);
  }

  private async load(code: string): Promise<Result<Table | null, DbError>> {
    return Result.tryPromise({
      try: async () => {
        const [lobby] = await this.db.select().from(lobbies).where(eq(lobbies.code, code)).limit(1);
        if (lobby === undefined) return null;
        const [rows, [game], [chat]] = await Promise.all([
          this.db
            .select({
              userId: players.userId,
              name: players.name,
              role: players.role,
              dbSeat: players.seat,
              image: user.image,
            })
            .from(players)
            .innerJoin(user, eq(user.id, players.userId))
            .where(eq(players.lobbyId, lobby.id))
            .orderBy(asc(players.seat)),
          this.db.select().from(games).where(eq(games.lobbyId, lobby.id)).limit(1),
          this.db
            .select({ last: max(messages.id) })
            .from(messages)
            .where(eq(messages.lobbyId, lobby.id)),
        ]);
        // Une autre requête a pu charger la table pendant la lecture.
        const existing = this.tables.get(code);
        if (existing !== undefined) return existing;
        const table = new Table(lobby.id, lobby.code, {
          hostId: lobby.hostId,
          status: lobby.status,
          roundNo: lobby.roundNo,
          notice: lobby.notice,
          turnLimit: lobby.turnLimit,
          players: rows,
          game: game === undefined ? null : fromSnapshot(game.state),
          version: game?.version ?? 0,
          chatLast: chat?.last ?? null,
        });
        this.tables.set(code, table);
        return table;
      },
      catch: dbError,
    });
  }

  /** Retire de la mémoire les tables sans connexion ni activité depuis `idleMs`. */
  evictIdle(idleMs: number, canEvict: (t: Table) => boolean, now = Date.now()): number {
    let evicted = 0;
    for (const t of this.tables.values()) {
      if (t.sockets === 0 && now - t.lastActivity > idleMs && canEvict(t)) {
        this.tables.delete(t.code);
        evicted++;
      }
    }
    return evicted;
  }
}
