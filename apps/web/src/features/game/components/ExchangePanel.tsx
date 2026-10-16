import type { GameView as Game } from '@el-presidente/game';
import type { ReactNode } from 'react';
import { Panel } from '@/components/Panel/Panel';
import { PlayingCard } from '@/components/PlayingCard/PlayingCard';
import { sortCards } from '../cards';
import styles from './ExchangePanel.module.css';

const s = (n: number) => (n > 1 ? 's' : '');

export function ExchangePanel({ game, me, nameOf }: { game: Game; me: number; nameOf: (seat: number) => string }) {
  const lines: ReactNode[] = [];
  for (const e of game.exchanges) {
    if (e.from === me && e.done && e.cards) {
      lines.push(
        <div key={`g-${e.to}`} className={styles.line}>
          Vous avez donné à {nameOf(e.to)} :
          <MiniCards cards={e.cards} />
        </div>,
      );
    } else if (e.to === me && e.done && e.cards) {
      lines.push(
        <div key={`r-${e.from}`} className={styles.line}>
          {nameOf(e.from)} vous a donné :
          <MiniCards cards={e.cards} />
        </div>,
      );
    } else if (e.to === me && !e.done) {
      lines.push(
        <div key={`w-${e.from}`} className={`${styles.line} muted`}>
          {nameOf(e.from)} choisit {e.count} carte{s(e.count)} à vous donner…
        </div>,
      );
    } else if (e.from === me && !e.done) {
      lines.push(
        <div key={`c-${e.to}`} className={styles.line}>
          <strong>
            Choisissez {e.count} carte{s(e.count)} à donner à {nameOf(e.to)}.
          </strong>
        </div>,
      );
    }
  }
  if (lines.length === 0) {
    const pending = game.exchanges.filter((e) => !e.done).map((e) => nameOf(e.from));
    lines.push(
      <div key="others" className={`${styles.line} muted`}>
        {pending.length
          ? `${pending.join(' et ')} choisi${pending.length > 1 ? 'ssent' : 't'} les cartes à rendre…`
          : ''}
      </div>,
    );
  }
  return (
    <Panel className={styles.exchange}>
      <h3 className="title-rye">Intercambio</h3>
      {lines}
    </Panel>
  );
}

function MiniCards({ cards }: { cards: string[] }) {
  return (
    <span className={styles.mini}>
      {sortCards(cards).map((c) => (
        <PlayingCard key={c} card={c} className={styles.miniCard} />
      ))}
    </span>
  );
}
