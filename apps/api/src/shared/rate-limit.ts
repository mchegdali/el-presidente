// Seau à jetons en mémoire, par clé (utilisateur, adresse…).

interface Bucket {
  tokens: number;
  at: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  /** `capacity` jetons, rechargés à raison de `perSecond` par seconde. */
  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {}

  /** Consomme un jeton ; renvoie 0 si accepté, sinon le délai d'attente conseillé (s). */
  take(key: string, now = Date.now()): number {
    let b = this.buckets.get(key);
    if (b === undefined) {
      b = { tokens: this.capacity, at: now };
      this.buckets.set(key, b);
    } else {
      b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.perSecond);
      b.at = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - b.tokens) / this.perSecond);
  }

  /** Oublie les seaux pleins (appelé périodiquement). */
  sweep(now = Date.now()): void {
    for (const [key, b] of this.buckets) {
      if (b.tokens + ((now - b.at) / 1000) * this.perSecond >= this.capacity) this.buckets.delete(key);
    }
  }
}
