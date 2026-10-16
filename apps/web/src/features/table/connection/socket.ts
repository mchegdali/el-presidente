// Connexion WebSocket d'une table : protocole binaire, reconnexion avec gigue (pas de
// tempête de reconnexions synchronisées), présence (onglet visible ou non), requêtes
// avec accusé de réception.

import {
  decodeServer,
  encodeClient,
  Writer,
  type ClientMessage,
  type ServerMessage,
} from '@el-presidente/game/protocol';
import { API_WS_URL } from '@/lib/config';
import { takeEarlySocket } from './early-socket';

export type RequestResult = { ok: true } | { ok: false; message: string };
type Pending = (r: RequestResult) => void;

export interface SocketHandlers {
  message(msg: ServerMessage): void;
  status(live: boolean): void;
  /** Échecs de connexion consécutifs (pour vérifier que la table existe). */
  failed(attempts: number): void;
}

const REQUEST_TIMEOUT_MS = 8000;

export class TableSocket {
  private ws: WebSocket | null = null;
  private readonly writer = new Writer(256);
  private pending = new Map<number, Pending>();
  private req = 0;
  private attempts = 0;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly code: string,
    private readonly on: SocketHandlers,
  ) {}

  start(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    const early = takeEarlySocket(this.code);
    if (early !== null) {
      this.adopt(early.ws);
      if (early.ws.readyState === WebSocket.OPEN) this.onOpen();
      for (const data of early.queue) this.onData(data);
    } else {
      this.open();
    }
  }

  stop(): void {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.retry !== null) clearTimeout(this.retry);
    this.ws?.close(1000);
    this.failAll('Connexion fermée.');
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(encodeClient(this.writer, msg));
    return true;
  }

  /** Envoie un message avec numéro de requête et attend l'accusé ou le refus du serveur. */
  request(msg: Extract<ClientMessage, { req: number }>): Promise<RequestResult> {
    const req = (this.req = (this.req % 65535) + 1);
    if (!this.send({ ...msg, req })) return Promise.resolve({ ok: false, message: 'Connexion perdue, reconnexion…' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(req);
        resolve({ ok: false, message: 'Le serveur ne répond pas.' });
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(req, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
  }

  private open(): void {
    const active = document.visibilityState === 'visible' ? 1 : 0;
    const ws = new WebSocket(`${API_WS_URL}/tables/${this.code}/ws?active=${active}`);
    ws.binaryType = 'arraybuffer';
    this.adopt(ws);
  }

  private adopt(ws: WebSocket): void {
    this.ws = ws;
    ws.addEventListener('open', () => this.onOpen());
    ws.addEventListener('message', (e) => this.onData(e.data as ArrayBuffer));
    ws.addEventListener('close', () => this.onClose(ws));
  }

  private onOpen(): void {
    this.attempts = 0;
    this.on.status(true);
  }

  private onData(data: ArrayBuffer): void {
    let msg: ServerMessage;
    try {
      msg = decodeServer(new Uint8Array(data));
    } catch {
      this.send({ op: 'sync' });
      return;
    }
    if (msg.op === 'ack' || msg.op === 'reject') {
      const done = this.pending.get(msg.req);
      this.pending.delete(msg.req);
      done?.(msg.op === 'ack' ? { ok: true } : { ok: false, message: msg.message });
      return;
    }
    this.on.message(msg);
  }

  private onClose(ws: WebSocket): void {
    if (ws !== this.ws) return;
    this.ws = null;
    this.on.status(false);
    this.failAll('Connexion perdue, reconnexion…');
    if (this.closed) return;
    this.attempts++;
    this.on.failed(this.attempts);
    // 0,5 s, 1 s, 2 s… jusqu'à 10 s, avec ±50 % de gigue.
    const base = Math.min(10_000, 500 * 2 ** Math.min(this.attempts - 1, 5));
    this.retry = setTimeout(() => this.open(), base * (0.5 + Math.random()));
  }

  private failAll(message: string): void {
    for (const done of this.pending.values()) done({ ok: false, message });
    this.pending.clear();
  }

  private readonly onVisibility = () => {
    this.send({ op: 'presence', active: document.visibilityState === 'visible' });
  };
}
