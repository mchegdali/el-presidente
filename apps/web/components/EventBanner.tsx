'use client';

import { useEffect, useRef, useState } from 'react';
import { ordinal } from '@/lib/roles';
import type { GameEvent } from '@/lib/types';

type Banner = { key: number; title: string; text: string; tone: 'big' | 'small' };

function describe(ev: GameEvent, nameOf: (id: string) => string, roundNo: number): Banner | null {
  const who = nameOf(ev.player ?? '');
  switch (ev.type) {
    case 'cut':
      return { key: ev.seq, title: '¡Corte!', text: `${who} coupe à 4 et relance`, tone: 'big' };
    case 'two':
      return { key: ev.seq, title: '¡El Mero Mero!', text: `${who} ferme le pli avec un 2`, tone: 'big' };
    case 'won':
      return { key: ev.seq, title: 'Todos pasan', text: `${who} remporte le pli`, tone: 'small' };
    case 'finished':
      return {
        key: ev.seq,
        title: ev.position === 1 ? '¡Viva El Presidente!' : '¡Adiós!',
        text: `${who} termine ${ordinal(ev.position ?? 0)}`,
        tone: ev.position === 1 ? 'big' : 'small',
      };
    case 'round_start':
      return {
        key: ev.seq,
        title: `Ronda ${roundNo}`,
        text: ev.reason === 'queen' ? `${who} a la Dame de cœur et commence` : `${who} commence`,
        tone: 'small',
      };
    case 'timeout':
      return {
        key: ev.seq,
        title: '¡Se acabó el tiempo!',
        text:
          ev.action === 'give'
            ? `${who} a trop tardé : cartes données automatiquement`
            : ev.action === 'play'
              ? `${who} a trop tardé : sa plus petite carte est jouée`
              : `${who} a trop tardé et passe`,
        tone: 'small',
      };
    case 'exchange_done':
      return { key: ev.seq, title: 'Cartes échangées', text: `${who} commence`, tone: 'small' };
    default:
      return null;
  }
}

// Affiche, l'une après l'autre, les annonces des événements survenus depuis le dernier rendu.
export default function EventBanner({
  events,
  nameOf,
  roundNo,
}: {
  events: GameEvent[];
  nameOf: (id: string) => string;
  roundNo: number;
}) {
  const lastSeen = useRef<number | null>(null);
  const lastRound = useRef(roundNo);
  const [queue, setQueue] = useState<Banner[]>([]);

  useEffect(() => {
    if (lastRound.current !== roundNo) {
      lastRound.current = roundNo;
      lastSeen.current = 0;
    }
    const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), 0);
    if (lastSeen.current === null) {
      // Premier affichage : on ne rejoue pas l'historique, sauf le début de manche.
      lastSeen.current = maxSeq;
      const start = events.length === 1 && events[0].type === 'round_start' ? events[0] : null;
      if (start) setQueue([describe(start, nameOf, roundNo)!]);
      return;
    }
    const fresh = events
      .filter((e) => e.seq > (lastSeen.current ?? 0))
      .map((e) => describe(e, nameOf, roundNo))
      .filter((b): b is Banner => !!b);
    lastSeen.current = Math.max(lastSeen.current, maxSeq);
    if (fresh.length) setQueue((q) => [...q, ...fresh].slice(-4));
  }, [events, nameOf, roundNo]);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), current.tone === 'big' ? 1900 : 1400);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return (
    <div key={current.key} className={`banner banner--${current.tone}`} role="status">
      <div className="banner__title title-rye">{current.title}</div>
      <div className="banner__text">{current.text}</div>
    </div>
  );
}
