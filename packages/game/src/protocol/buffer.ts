// Lecture/écriture binaire sans allocation sur le chemin chaud.

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Tampon d'écriture réutilisable. `finish()` renvoie une vue sur le tampon interne,
 * valable jusqu'au prochain `reset()` : l'appelant l'envoie (Bun copie les octets)
 * ou la copie avant de réécrire.
 */
export class Writer {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(size = 1024) {
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
  }

  reset(): this {
    this.pos = 0;
    return this;
  }

  private ensure(bytes: number): void {
    if (this.pos + bytes <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.pos + bytes));
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): this {
    this.ensure(1);
    this.buf[this.pos++] = v;
    return this;
  }

  i8(v: number): this {
    this.ensure(1);
    this.view.setInt8(this.pos++, v);
    return this;
  }

  u16(v: number): this {
    this.ensure(2);
    this.view.setUint16(this.pos, v);
    this.pos += 2;
    return this;
  }

  u32(v: number): this {
    this.ensure(4);
    this.view.setUint32(this.pos, v);
    this.pos += 4;
    return this;
  }

  f64(v: number): this {
    this.ensure(8);
    this.view.setFloat64(this.pos, v);
    this.pos += 8;
    return this;
  }

  bytes(values: ArrayLike<number>): this {
    this.ensure(values.length);
    for (let i = 0; i < values.length; i++) this.buf[this.pos++] = values[i]!;
    return this;
  }

  /** Chaîne UTF-8 jusqu'à la fin du message. */
  text(s: string): this {
    this.ensure(s.length * 3);
    const { written } = encoder.encodeInto(s, this.buf.subarray(this.pos));
    this.pos += written;
    return this;
  }

  finish(): Uint8Array {
    return this.buf.subarray(0, this.pos);
  }

  /** Copie indépendante du tampon (à garder ou à envoyer plus tard). */
  copy(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export class DecodeError extends Error {}

export class Reader {
  private view: DataView;
  pos = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private need(bytes: number): void {
    if (this.pos + bytes > this.buf.length) throw new DecodeError('message tronqué');
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++]!;
  }

  i8(): number {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }

  /** Liste d'octets précédée de sa longueur (u8), bornée par `max`. */
  smallList(max: number): number[] {
    const k = this.u8();
    if (k > max) throw new DecodeError('liste trop longue');
    this.need(k);
    const out: number[] = [];
    for (let i = 0; i < k; i++) out.push(this.buf[this.pos++]!);
    return out;
  }

  /** Reste du message en UTF-8, borné en octets. */
  text(maxBytes: number): string {
    if (this.remaining > maxBytes) throw new DecodeError('texte trop long');
    const s = decoder.decode(this.buf.subarray(this.pos));
    this.pos = this.buf.length;
    return s;
  }

  end(): void {
    if (this.pos !== this.buf.length) throw new DecodeError('octets en trop');
  }
}
