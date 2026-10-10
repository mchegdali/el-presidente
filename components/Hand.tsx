'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Card } from './Card';

type Props = {
  cards: string[];
  selected: Set<string>;
  onToggle?: (card: string) => void;
  /** Cartes mises en valeur ; les autres sont assombries. */
  playable?: Set<string> | null;
};

// Dispose la main en éventail sur une ou plusieurs rangées selon la largeur
// disponible, en gardant l'index (valeur + couleur) de chaque carte visible.
export default function Hand({ cards, selected, onToggle, playable }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cardW = width < 420 ? 64 : width < 760 ? 80 : 96;
  const cardH = cardW * 1.4;
  const minStep = cardW * 0.4;
  const maxStep = cardW * 0.7;
  const perRowMax = Math.max(1, Math.floor((width - cardW) / minStep) + 1);
  const rowCount = Math.max(1, Math.ceil(cards.length / perRowMax));
  const perRow = Math.ceil(cards.length / rowCount);
  const rows: string[][] = [];
  for (let i = 0; i < cards.length; i += perRow) rows.push(cards.slice(i, i + perRow));
  const rowOverlap = cardH * 0.42;

  return (
    <div className="hand" ref={ref} style={{ paddingTop: cardH * 0.25 }}>
      {width > 0 &&
        rows.map((row, r) => {
          const step = row.length > 1 ? Math.min(maxStep, (width - cardW) / (row.length - 1)) : 0;
          const rowWidth = cardW + step * (row.length - 1);
          const left = (width - rowWidth) / 2;
          return (
            <div
              key={r}
              className="hand__row"
              style={{ height: cardH, marginTop: r === 0 ? 0 : -rowOverlap, zIndex: r }}
            >
              {row.map((card, i) => (
                <Card
                  key={card}
                  card={card}
                  selected={selected.has(card)}
                  dimmed={playable ? !playable.has(card) : false}
                  onClick={onToggle ? () => onToggle(card) : undefined}
                  className="hand__card"
                  style={{ left: left + i * step, width: cardW, zIndex: i }}
                />
              ))}
            </div>
          );
        })}
      {cards.length === 0 && <p className="hand__empty muted">Plus de cartes en main.</p>}
    </div>
  );
}
