'use client';

import { PapelPicado } from '@/components/Decor/Decor';
import { Page } from '@/components/Page/Page';
import { Panel } from '@/components/Panel/Panel';
import { Chat } from '../../chat/Chat';
import { ordinal } from '../../game/cards';
import { ROLE_INFO } from '../../game/roles';
import { PushToggle } from '../../push/PushToggle';
import { useTableContext } from '../context';
import { InvitePanel } from './InvitePanel';
import { PlayersPanel } from './PlayersPanel';
import styles from './Room.module.css';
import { StartRound } from './StartRound';
import { TopBar } from './TopBar';
import { TurnLimitSetting } from './TurnLimitSetting';

export function Results() {
  const { table, me } = useTableContext();
  const finished = table.game?.finished ?? [];
  const ranking = finished.flatMap((seat, i) => {
    const player = table.players[seat];
    return player ? [{ player, position: i + 1 }] : [];
  });
  const newcomers = table.players.filter((p) => !finished.includes(p.seat));

  return (
    <>
      <PapelPicado />
      <Page className={styles.results}>
        <TopBar title={`Fin de la manche ${table.roundNo}`} />
        <h1 className={`${styles.resultsTitle} title-rye`}>¡Se acabó la ronda!</h1>

        <ol className={styles.podium}>
          {ranking.map(({ player, position }) => {
            const role = ROLE_INFO[player.role ?? 'neutral'];
            return (
              <li key={player.id} className={`${styles.row} ${styles[player.role ?? 'neutral']}`}>
                <span className={styles.pos}>{ordinal(position)}</span>
                <span className={styles.icon} aria-hidden="true">
                  {role.icon}
                </span>
                <span className={styles.who}>
                  <strong>{player.name}</strong>
                  {player.seat === me && <em> (vous)</em>}
                </span>
                <span className={styles.role}>
                  <span className={styles.fr}>{role.fr}</span>
                  <span className={`${styles.es} title-rye`}>{role.es}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {newcomers.length > 0 && (
          <p className="muted">
            {newcomers.map((p) => p.name).join(', ')} rejoindr{newcomers.length > 1 ? 'ont' : 'a'} la prochaine manche.
          </p>
        )}

        <StartRound label="¡Otra ronda! Rejouer" waiting="pour relancer une manche…">
          <p className="muted small">
            Au début de la manche, le Trou-du-cul donne ses 2 meilleures cartes au Président, qui lui en rend 2 de son
            choix.
          </p>
        </StartRound>

        <Panel className={styles.settings}>
          <TurnLimitSetting />
          <PushToggle />
        </Panel>
        <Chat />
        <div className={styles.grid}>
          <PlayersPanel />
          <InvitePanel code={table.code} />
        </div>
      </Page>
    </>
  );
}
