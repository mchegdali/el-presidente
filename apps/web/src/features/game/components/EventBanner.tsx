'use client';

import type { GameEvent } from '@el-presidente/game';
import { useEffect, useState } from 'react';
import { ordinal } from '../cards';
import styles from './EventBanner.module.css';

type Banner = { key: number; title: string; text: string; tone: 'big' | 'small' };

function describe(ev: GameEvent, nameOf: (seat: number) => string, roundNo: number): Banner | null {
  const who = 'player' in ev ? nameOf(ev.player) : '';
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
        text: `${who} termine ${ordinal(ev.position)}`,
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
export function EventBanner({
  events,
  nameOf,
  roundNo,
}: {
  events: GameEvent[];
  nameOf: (seat: number) => string;
  roundNo: number;
}) {
  // Dernier événement déjà annoncé, par manche. Mis à jour pendant le rendu (état dérivé
  // des props), sans effet : React refait le rendu aussitôt, avant de peindre.
  const [seen, setSeen] = useState<{ round: number; seq: number } | null>(null);
  const [queue, setQueue] = useState<Banner[]>([]);
  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), 0);

  if (seen === null) {
    // Premier affichage : on ne rejoue pas l'historique, sauf le début de manche.
    setSeen({ round: roundNo, seq: maxSeq });
    const start = events.length === 1 && events[0]!.type === 'round_start' ? events[0]! : null;
    const banner = start && describe(start, nameOf, roundNo);
    if (banner) setQueue([banner]);
  } else if (seen.round !== roundNo || maxSeq > seen.seq) {
    const from = seen.round !== roundNo ? 0 : seen.seq;
    const fresh = events
      .filter((e) => e.seq > from)
      .map((e) => describe(e, nameOf, roundNo))
      .filter((b): b is Banner => b !== null);
    setSeen({ round: roundNo, seq: maxSeq });
    if (fresh.length) setQueue((q) => [...q, ...fresh].slice(-4));
  }

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), current.tone === 'big' ? 1900 : 1400);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return (
    <output key={current.key} className={`${styles.banner} ${styles[current.tone]}`}>
      <span className={`${styles.title} title-rye`}>{current.title}</span>
      <span className={styles.text}>{current.text}</span>
    </output>
  );
}
