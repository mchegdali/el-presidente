'use client';

import { useEffect, useState } from 'react';

export type Clock = { seconds: number; fraction: number };

/** Temps restant (ms) avant l'échéance, selon l'horloge du serveur ; null sans échéance. */
export function useCountdown(deadline: number | null, serverNow: () => number): number | null {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(timer);
  }, [deadline, serverNow]);
  return deadline === null ? null : Math.max(0, deadline - now);
}
