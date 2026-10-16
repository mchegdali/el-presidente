// Délestage progressif : entre 85 % et 95 % des limites (descripteurs ouverts, mémoire),
// on refuse une proportion croissante de *nouvelles* connexions (503 + Retry-After),
// sans jamais couper une partie en cours. Une bascule tout-ou-rien provoquerait des
// tempêtes de reconnexions synchronisées.

import { readdirSync, readFileSync } from 'node:fs';

const LOW = 0.85;
const HIGH = 0.95;

function fdLimit(): number {
  try {
    const line = readFileSync('/proc/self/limits', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('Max open files'));
    const soft = Number(line?.split(/\s{2,}/)[1]);
    return Number.isFinite(soft) && soft > 0 ? soft : 0;
  } catch {
    return 0;
  }
}

export class Shedder {
  private pressure = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly maxFds = fdLimit();

  constructor(
    private readonly maxRssBytes: number,
    private readonly random: () => number = Math.random,
  ) {}

  start(intervalMs = 100): void {
    this.timer = setInterval(() => this.sample(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  /** Pression entre 0 et 1, d'après le plus contraint des deux ratios. */
  sample(): number {
    let ratio = process.memoryUsage().rss / this.maxRssBytes;
    if (this.maxFds > 0) {
      try {
        ratio = Math.max(ratio, readdirSync('/proc/self/fd').length / this.maxFds);
      } catch {
        // pas de /proc : seule la mémoire compte
      }
    }
    this.pressure = Math.min(1, Math.max(0, (ratio - LOW) / (HIGH - LOW)));
    return this.pressure;
  }

  /** Faut-il refuser cette nouvelle connexion ? */
  shouldShed(): boolean {
    return this.pressure > 0 && this.random() < this.pressure;
  }
}
