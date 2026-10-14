// Connexions WebSocket des tables. Diffusion par le pub/sub natif de Bun (uWebSockets,
// en C++) : un seul tampon encodé par événement, poussé à tous les abonnés du sujet.
//   t:<table>  tout le monde (joueurs et visiteurs) : coups, emotes, présence
//   m:<table>  joueurs seulement : chat

import { encodeServer, Writer, type ServerMessage } from '@el-presidente/game/protocol';
import { snapshotFor } from '../features/tables/shared/snapshot';
import type { Table } from '../features/tables/shared/table';

export interface SocketData {
  userId: string | null;
  tableId: string;
  code: string;
  /** Onglet visible. */
  active: boolean;
  /** Abonné au sujet des joueurs. */
  member: boolean;
}

/** Sous-ensemble de ServerWebSocket utilisé ici (remplaçable en test). */
export interface ClientSocket {
  data: SocketData;
  send(data: Uint8Array): number;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  close(code?: number, reason?: string): void;
}

export interface Publisher {
  publish(topic: string, data: Uint8Array): number;
}

const publicTopic = (t: Table) => `t:${t.id}`;
const membersTopic = (t: Table) => `m:${t.id}`;

export class Hub {
  private sockets = new Map<string, Set<ClientSocket>>();
  private readonly w = new Writer(4096);
  publisher: Publisher | null = null;

  /** Tampon encodé, valable jusqu'au prochain encodage. */
  encode(msg: ServerMessage): Uint8Array {
    return encodeServer(this.w, msg);
  }

  attach(table: Table, ws: ClientSocket): void {
    let set = this.sockets.get(table.id);
    if (set === undefined) {
      set = new Set();
      this.sockets.set(table.id, set);
    }
    set.add(ws);
    table.sockets = set.size;
    ws.subscribe(publicTopic(table));
    this.syncMembership(table, ws);
  }

  detach(table: Table, ws: ClientSocket): void {
    const set = this.sockets.get(table.id);
    if (set === undefined) return;
    set.delete(ws);
    table.sockets = set.size;
    if (set.size === 0) this.sockets.delete(table.id);
  }

  socketsOf(table: Table): ReadonlySet<ClientSocket> {
    return this.sockets.get(table.id) ?? new Set();
  }

  get connections(): number {
    let n = 0;
    for (const s of this.sockets.values()) n += s.size;
    return n;
  }

  /** Abonne ou désabonne une connexion du sujet des joueurs selon sa place à la table. */
  private syncMembership(table: Table, ws: ClientSocket): void {
    const member = ws.data.userId !== null && table.seatOf(ws.data.userId) >= 0;
    if (member === ws.data.member) return;
    ws.data.member = member;
    if (member) ws.subscribe(membersTopic(table));
    else ws.unsubscribe(membersTopic(table));
  }

  publish(table: Table, msg: ServerMessage): void {
    this.publisher?.publish(publicTopic(table), this.encode(msg));
  }

  publishMembers(table: Table, msg: ServerMessage): void {
    this.publisher?.publish(membersTopic(table), this.encode(msg));
  }

  send(ws: ClientSocket, msg: ServerMessage): void {
    // 0 = message abandonné (client trop lent) : on ferme, il se reconnectera et
    // recevra un état complet.
    if (ws.send(this.encode(msg)) === 0) ws.close(1013, 'client trop lent');
  }

  /** Envoie à chaque connexion de la table un message construit pour elle. */
  each(table: Table, build: (ws: ClientSocket) => ServerMessage | null): void {
    for (const ws of this.socketsOf(table)) {
      const msg = build(ws);
      if (msg !== null) this.send(ws, msg);
    }
  }

  /** État complet à chaque connexion (changement de joueurs, nouvelle manche…). */
  sendSnapshots(table: Table, now = Date.now()): void {
    for (const ws of this.socketsOf(table)) {
      this.syncMembership(table, ws);
      this.send(ws, { op: 'snapshot', snapshot: snapshotFor(table, ws.data.userId, now) });
    }
  }

  sendSnapshot(table: Table, ws: ClientSocket, now = Date.now()): void {
    this.send(ws, { op: 'snapshot', snapshot: snapshotFor(table, ws.data.userId, now) });
  }

  /** Ferme les connexions d'un joueur retiré de la table (elles restent en visiteur). */
  forget(table: Table, userId: string): void {
    for (const ws of this.socketsOf(table)) if (ws.data.userId === userId) this.syncMembership(table, ws);
  }

  closeAll(table: Table, reason: string): void {
    for (const ws of this.socketsOf(table)) ws.close(1000, reason);
  }
}
