import type { GameView as Game, TrickEntryView } from '@el-presidente/game';
import { PlayingCard } from '@/components/PlayingCard/PlayingCard';
import { FORMAT_LABELS, forcedRankOf, rankLabel } from '../cards';
import styles from './TrickArea.module.css';

const ROTATIONS = [-7, 5, -3, 8, -5, 3];

function TrickPile({
  entries,
  nameOf,
  faded,
}: {
  entries: TrickEntryView[];
  nameOf: (seat: number) => string;
  faded?: boolean;
}) {
  const plays = entries.filter((e): e is { p: number; c: string[] } => 'c' in e).slice(-4);
  return (
    <div className={faded ? `${styles.pile} ${styles.faded}` : styles.pile}>
      {plays.map((play, i) => {
        const depth = plays.length - 1 - i;
        return (
          <div
            key={`${play.p}-${play.c.join('')}`}
            className={depth === 0 ? `${styles.play} ${styles.top}` : styles.play}
            style={{
              transform: `translate(${-depth * 14}px, ${-depth * 10}px) rotate(${ROTATIONS[(i + plays.length) % ROTATIONS.length]}deg) scale(${1 - depth * 0.08})`,
              zIndex: i,
            }}
          >
            <div className={styles.cards}>
              {play.c.map((c) => (
                <PlayingCard key={c} card={c} className={styles.card} />
              ))}
            </div>
            {depth === 0 && <span className={styles.who}>{nameOf(play.p)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function TrickArea({ game, nameOf }: { game: Game; nameOf: (seat: number) => string }) {
  if (game.phase === 'exchange') {
    return (
      <div className={styles.trick}>
        <p className={`${styles.hint} title-rye`}>Intercambio de cartas…</p>
      </div>
    );
  }
  const forced = forcedRankOf(game.trick, game.trickSize);
  const hasTrick = game.trick.some((t) => 'c' in t);
  return (
    <div className={styles.trick}>
      {hasTrick ? (
        <>
          <div className={forced ? `${styles.format} ${styles.forced}` : styles.format}>
            {FORMAT_LABELS[game.trickSize]} ·{' '}
            {forced ? `${rankLabel(forced)} ou rien !` : `${rankLabel(game.trickRank)} ou plus`}
          </div>
          <TrickPile entries={game.trick} nameOf={nameOf} />
        </>
      ) : game.prevTrick.some((t) => 'c' in t) ? (
        <>
          <div className={`${styles.format} ${styles.soft}`}>Pli pour {nameOf(game.prevWinner)}</div>
          <TrickPile entries={game.prevTrick} nameOf={nameOf} faded />
        </>
      ) : (
        <p className={`${styles.hint} title-rye`}>La mesa está lista</p>
      )}
    </div>
  );
}
