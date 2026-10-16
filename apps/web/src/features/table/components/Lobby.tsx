'use client';

import { Alert } from '@/components/Alert/Alert';
import { PapelPicado } from '@/components/Decor/Decor';
import { Page } from '@/components/Page/Page';
import { Panel } from '@/components/Panel/Panel';
import { Chat } from '../../chat/Chat';
import { PushToggle } from '../../push/PushToggle';
import { Rules } from '../../rules/Rules';
import { useTableContext } from '../context';
import { InvitePanel } from './InvitePanel';
import { PlayersPanel } from './PlayersPanel';
import styles from './Room.module.css';
import { StartRound } from './StartRound';
import { TopBar } from './TopBar';
import { TurnLimitSetting } from './TurnLimitSetting';

export function Lobby() {
  const { table } = useTableContext();
  return (
    <>
      <PapelPicado />
      <Page>
        <TopBar title="La sala de espera" />
        {table.notice && <Alert tone="notice">{table.notice}</Alert>}
        <div className={styles.grid}>
          <InvitePanel code={table.code} />
          <PlayersPanel />
        </div>
        <Panel className={styles.settings}>
          <TurnLimitSetting />
          <PushToggle />
        </Panel>
        <Chat />
        <StartRound label="¡Vámonos! Distribuer les cartes" waiting="pour lancer la partie…" />
        <Rules />
      </Page>
    </>
  );
}
