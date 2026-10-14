// Table en mémoire : état autoritaire d'une table chargée (joueurs, manche, présence).
// Les coups s'appliquent de façon synchrone ; les actions qui écrivent en base d'abord
// (rejoindre, lancer une manche…) prennent le verrou de la table pendant leur écriture,
// et les coups qui arrivent pendant ce temps attendent leur tour.

import type { GameState, Role } from '@el-presidente/game';
import type { LobbyStatus } from '@el-presidente/game/protocol';

export interface Seat {
  userId: string;
  name: string;
  image: string | null;
  role: Role | null;
  /** Ordre d'arrivée en base ; le siège de jeu est l'index dans `players`. */
  dbSeat: number;
}

export class Table {
  hostId: string | null;
  status: LobbyStatus;
  roundNo: number;
  notice: string | null;
  turnLimit: number | null;
  players: Seat[];
  game: GameState | null;
  /** Incrémentée à chaque changement diffusé aux clients. */
  version: number;
  chatLast: number | null;
  /** Onglets visibles par joueur. */
  readonly online = new Map<string, number>();
  readonly emotes = new Map<string, { emote: number; at: number }>();
  /** Début du tour déjà notifié par push, par joueur. */
  readonly notified = new Map<string, number>();
  /** Connexions WebSocket ouvertes sur la table. */
  sockets = 0;
  lastActivity = Date.now();

  private locked = false;
  private waiting: (() => void)[] = [];

  constructor(
    readonly id: string,
    readonly code: string,
    init: {
      hostId: string | null;
      status: LobbyStatus;
      roundNo: number;
      notice: string | null;
      turnLimit: number | null;
      players: Seat[];
      game: GameState | null;
      version: number;
      chatLast: number | null;
    },
  ) {
    this.hostId = init.hostId;
    this.status = init.status;
    this.roundNo = init.roundNo;
    this.notice = init.notice;
    this.turnLimit = init.turnLimit;
    this.players = init.players;
    this.game = init.game;
    this.version = init.version;
    this.chatLast = init.chatLast;
  }

  seatOf(userId: string): number {
    for (let i = 0; i < this.players.length; i++) if (this.players[i]!.userId === userId) return i;
    return -1;
  }

  isOnline(userId: string): boolean {
    return (this.online.get(userId) ?? 0) > 0;
  }

  get roundActive(): boolean {
    return this.status === 'exchange' || this.status === 'playing';
  }

  /** Échéance de la passe automatique, ou null. */
  deadline(): number | null {
    const g = this.game;
    if (this.turnLimit === null || g === null || (g.phase !== 'playing' && g.phase !== 'exchange')) return null;
    return g.turnStartedAt + this.turnLimit * 1000;
  }

  /** Exécute `fn` seul sur la table (actions qui écrivent en base avant de modifier l'état). */
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    while (this.locked) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.locked = true;
    try {
      return await fn();
    } finally {
      this.locked = false;
      this.waiting.shift()?.();
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** Exécute `fn` (synchrone) tout de suite si la table est libre, sinon après le verrou. */
  whenFree<T>(fn: () => T): Promise<T> | T {
    if (!this.locked) return fn();
    return this.exclusive(async () => fn());
  }
}
