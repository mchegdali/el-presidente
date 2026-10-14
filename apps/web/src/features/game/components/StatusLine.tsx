import type { GameView as Game } from '@el-presidente/game';
import type { PlayerSnapshot } from '@el-presidente/game/protocol';
import type { ReactNode } from 'react';
import { FORMAT_LABELS, forcedRankOf, ordinal, rankLabel } from '../cards';
import { ROLE_INFO } from '../roles';
import type { Clock } from '../use-countdown';
import styles from './GameView.module.css';

export function StatusLine({
  game,
  me,
  myPlayer,
  nameOf,
  clock,
}: {
  game: Game;
  me: number;
  myPlayer: PlayerSnapshot | undefined;
  nameOf: (seat: number) => string;
  clock: Clock | null;
}) {
  const role = myPlayer?.role ? ROLE_INFO[myPlayer.role] : null;
  const forced = forcedRankOf(game.trick, game.trickSize);
  const myPosition = game.finished.indexOf(me) + 1;
  let text: ReactNode;
  if (myPosition > 0) {
    text = <>Vous êtes sorti {ordinal(myPosition)} ! Regardez les autres se battre…</>;
  } else if (game.phase === 'exchange') {
    text = <>Échange des cartes en cours</>;
  } else if (game.turn === me) {
    text =
      game.trickSize === 0 ? (
        <strong>À vous d&apos;ouvrir le pli !</strong>
      ) : (
        <strong>
          À vous ! {FORMAT_LABELS[game.trickSize]},{' '}
          {forced ? `${rankLabel(forced)} ou rien` : `${rankLabel(game.trickRank)} ou plus`}
        </strong>
      );
  } else {
    text = <>{nameOf(game.turn)} réfléchit…</>;
  }
  return (
    <>
      <span className={styles.name}>
        {role && <span title={role.fr}>{role.icon} </span>}
        {myPlayer?.name}
      </span>
      <span className={styles.text}>{text}</span>
      {clock && (
        <span className={clock.seconds <= 10 ? `${styles.clock} ${styles.clockUrgent}` : styles.clock}>
          ⏱ {clock.seconds} s
        </span>
      )}
    </>
  );
}
