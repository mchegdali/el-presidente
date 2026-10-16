// Métriques en mémoire, exposées au format texte Prometheus sur /metrics (protégé).

/** Histogramme à seaux fixes (microsecondes), sans allocation à l'enregistrement. */
export class Histogram {
  private readonly counts: Float64Array;
  sum = 0;
  count = 0;

  constructor(readonly bounds: readonly number[]) {
    this.counts = new Float64Array(bounds.length + 1);
  }

  record(value: number): void {
    let i = 0;
    while (i < this.bounds.length && value > this.bounds[i]!) i++;
    this.counts[i]! += 1;
    this.sum += value;
    this.count++;
  }

  render(name: string, help: string): string {
    let out = `# HELP ${name} ${help}\n# TYPE ${name} histogram\n`;
    let cumulative = 0;
    this.bounds.forEach((b, i) => {
      cumulative += this.counts[i]!;
      out += `${name}_bucket{le="${b}"} ${cumulative}\n`;
    });
    cumulative += this.counts[this.bounds.length]!;
    out += `${name}_bucket{le="+Inf"} ${cumulative}\n${name}_sum ${this.sum}\n${name}_count ${this.count}\n`;
    return out;
  }
}

export const metrics = {
  /** Du décodage d'un coup à sa diffusion (µs). */
  moveLatency: new Histogram([25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]),
  moves: 0,
  rejected: 0,
  malformed: 0,
  shed: 0,
  /** Retard de la boucle d'événements mesuré toutes les 500 ms (ms). */
  loopLag: 0,
};

let lagTimer: ReturnType<typeof setInterval> | null = null;

export function startLoopLagProbe(): void {
  let expected = performance.now() + 500;
  lagTimer = setInterval(() => {
    const now = performance.now();
    metrics.loopLag = Math.max(0, now - expected);
    expected = now + 500;
  }, 500);
  lagTimer.unref?.();
}

export function renderMetrics(gauges: Record<string, number>): string {
  const mem = process.memoryUsage();
  let out = metrics.moveLatency.render('presidente_move_latency_us', 'Délai coup reçu → diffusé');
  const lines: Record<string, number> = {
    presidente_moves_total: metrics.moves,
    presidente_moves_rejected_total: metrics.rejected,
    presidente_messages_malformed_total: metrics.malformed,
    presidente_connections_shed_total: metrics.shed,
    presidente_event_loop_lag_ms: metrics.loopLag,
    presidente_rss_bytes: mem.rss,
    presidente_heap_used_bytes: mem.heapUsed,
    ...gauges,
  };
  for (const [k, v] of Object.entries(lines)) out += `${k} ${v}\n`;
  return out;
}
