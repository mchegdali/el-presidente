import type { GameView as Game } from '@el-presidente/game';
import type { PlayerSnapshot } from '@el-presidente/game/protocol';
import { EmoteBubble } from '../../emotes/Emotes';
import { ordinal } from '../cards';
import { ROLE_INFO } from '../roles';
import type { Clock } from '../use-countdown';
import styles from './OpponentChip.module.css';

type Props = {
  player: PlayerSnapshot;
  game: Game;
  isMe: boolean;
  acting: boolean;
  /** C'est à moi de jouer : les autres s'effacent. */
  dim: boolean;
  clock: Clock | null;
  now: number;
};

export function OpponentChip({ player, game, isMe, acting, dim, clock, now }: Props) {
  const position = game.finished.indexOf(player.seat) + 1;
  const lastAction = game.trick.findLast((t) => t.p === player.seat);
  const passed = lastAction !== undefined && 'pass' in lastAction;
  const role = player.role ? ROLE_INFO[player.role] : null;
  const cards = game.counts[player.seat] ?? 0;
  const classes = [
    styles.chip,
    acting && styles.turn,
    position > 0 && styles.out,
    isMe && styles.me,
    dim && !acting && styles.dim,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} aria-current={acting ? 'true' : undefined}>
      <EmoteBubble emote={player.emote} at={player.emoteAt} now={now} />
      <div className={styles.name}>
        {role && (
          <span className={styles.role} title={role.fr}>
            {role.icon}
          </span>
        )}
        {isMe ? 'Vous' : player.name}
        {!isMe && !player.online && (
          <span className={styles.away} title="Absent : page fermée ou en arrière-plan">
            💤
          </span>
        )}
      </div>
      <div className={styles.info}>
        {position > 0 ? (
          <span className={styles.outLabel}>Sorti {ordinal(position)}</span>
        ) : (
          <span className={styles.cards} title={`${cards} cartes`}>
            <span className={styles.back} aria-hidden="true" />×{cards}
          </span>
        )}
        {acting && (
          <span className={styles.thinking}>{clock ? `${clock.seconds} s` : isMe ? 'à vous !' : 'joue…'}</span>
        )}
        {!acting && passed && <span className={styles.pass}>passe</span>}
      </div>
      {clock && (
        <span className={styles.timer} aria-hidden="true">
          <span style={{ transform: `scaleX(${clock.fraction})` }} />
        </span>
      )}
    </div>
  );
}
