'use client';

import { PapelPicado } from '@/components/Decor/Decor';
import { Loading, Page } from '@/components/Page/Page';
import { useChat, useMentionBuzz } from '../../chat/use-chat';
import { GameView } from '../../game/components/GameView';
import { tableActions } from '../actions';
import { useTable } from '../connection/use-table';
import { TableContext, useTableContext } from '../context';
import { JoinForm } from './JoinForm';
import { Lobby } from './Lobby';
import { Results } from './Results';

export function TableRoom({ code }: { code: string }) {
  const conn = useTable(code);
  const actions = tableActions(code, conn.accept);
  const table = conn.table;

  if (table === undefined) {
    return (
      <>
        <PapelPicado />
        <Page centered>
          <Loading />
          {!conn.live && <p className="muted small">Connexion à la table…</p>}
        </Page>
      </>
    );
  }
  if (table.me === null) return <JoinForm table={table} actions={actions} />;

  const inRound = table.status === 'playing' || table.status === 'exchange';
  return (
    <TableContext value={{ conn, actions, table, me: table.me, isHost: table.hostSeat === table.me, inRound }}>
      <MentionBuzz />
      {table.status === 'waiting' ? <Lobby /> : table.status === 'finished' ? <Results /> : <GameView />}
    </TableContext>
  );
}

function MentionBuzz() {
  const { table, me } = useTableContext();
  const messages = useChat();
  const player = table.players[me];
  useMentionBuzz(messages, player?.id ?? '', player?.name);
  return null;
}
