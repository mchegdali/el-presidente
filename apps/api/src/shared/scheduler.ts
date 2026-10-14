// Une seule horloge pour toutes les échéances : tas binaire trié par date + un unique
// setTimeout réarmé sur la plus proche. Réarmer une clé ne retire pas l'ancienne entrée
// du tas : elle est ignorée à l'échéance (suppression paresseuse).

interface Entry {
  key: string;
  at: number;
}

export class Scheduler {
  private heap: Entry[] = [];
  private current = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerAt = Infinity;

  constructor(
    private readonly onDue: (key: string) => void,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Programme (ou annule, avec null) l'échéance de `key`. */
  set(key: string, at: number | null): void {
    if (at === null) {
      this.current.delete(key);
      return;
    }
    if (this.current.get(key) === at) return;
    this.current.set(key, at);
    this.push({ key, at });
    if (at < this.timerAt) this.arm();
  }

  get size(): number {
    return this.current.size;
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Infinity;
  }

  private arm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    const next = this.heap[0];
    if (next === undefined) {
      this.timer = null;
      this.timerAt = Infinity;
      return;
    }
    this.timerAt = next.at;
    this.timer = setTimeout(() => this.fire(), Math.max(0, next.at - this.clock()));
  }

  private fire(): void {
    this.timer = null;
    this.timerAt = Infinity;
    const now = this.clock();
    while (this.heap.length > 0 && this.heap[0]!.at <= now) {
      const e = this.pop()!;
      if (this.current.get(e.key) !== e.at) continue;
      this.current.delete(e.key);
      this.onDue(e.key);
    }
    this.arm();
  }

  private push(e: Entry): void {
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p]!.at <= h[i]!.at) break;
      [h[p], h[i]] = [h[i]!, h[p]!];
      i = p;
    }
  }

  private pop(): Entry | undefined {
    const h = this.heap;
    const top = h[0];
    const last = h.pop();
    if (h.length > 0 && last !== undefined) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l]!.at < h[m]!.at) m = l;
        if (r < h.length && h[r]!.at < h[m]!.at) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i]!, h[m]!];
        i = m;
      }
    }
    return top;
  }
}
