'use client';

import type { GameView as Game } from '@el-presidente/game';
import type { PlayerSnapshot } from '@el-presidente/game/protocol';
import { parseCard } from '@el-presidente/game';
import { Fragment, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { Page } from '@/components/Page/Page';
import { Chat } from '../../chat/Chat';
import { useChat, useUnread } from '../../chat/use-chat';
import { EmoteBar } from '../../emotes/Emotes';
import { TopBar } from '../../table/components/TopBar';
import { useTableContext } from '../../table/context';
import { forcedRankOf, playableCards, rankOfText, selectionProblem, sortCards } from '../cards';
import { useCountdown, type Clock } from '../use-countdown';
import { EventBanner } from './EventBanner';
import { ExchangePanel } from './ExchangePanel';
import styles from './GameView.module.css';
import { Hand } from './Hand';
import { OpponentChip } from './OpponentChip';
import { StatusLine } from './StatusLine';
import { TrickArea } from './TrickArea';

export function GameView() {
  const { table, me, conn } = useTableContext();
  const game = table.game as Game;
  const players = table.players;
  const nameOf = (seat: number) => players[seat]?.name ?? '?';

  const hand = table.hand ?? [];
  // Coup affiché tout de suite : les cartes quittent la main sans attendre le serveur ;
  // si le coup est refusé, elles reviennent à la fin de la transition.
  const [shownHand, removeFromHand] = useOptimistic(hand, (cur: string[], played: string[]) =>
    cur.filter((c) => !played.includes(c)),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const myTurn = game.phase === 'playing' && game.turn === me;

  // Les cartes sélectionnées qui ont quitté la main sont oubliées.
  const kept = [...selected].filter((c) => hand.includes(c));
  if (kept.length !== selected.size) setSelected(new Set(kept));

  // Échange : est-ce à moi de donner des cartes ?
  const myGive = game.phase === 'exchange' ? game.exchanges.find((e) => e.from === me && !e.done) : undefined;
  const mustAct = myTurn || myGive !== undefined;

  // Signal discret quand c'est à moi.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (mustAct && !wasMyTurn.current) navigator.vibrate?.(80);
    wasMyTurn.current = mustAct;
    document.title = mustAct ? '🔔 À vous ! — El Presidente' : 'El Presidente';
    return () => {
      document.title = 'El Presidente';
    };
  }, [mustAct]);

  // Chrono de la passe automatique (appliquée par le serveur à l'échéance).
  const limit = table.turnLimit;
  const timed = limit !== null && (game.phase === 'playing' || game.phase === 'exchange');
  const deadline = timed ? game.turnStartedAt + limit * 1000 : null;
  const remaining = useCountdown(deadline, conn.serverNow);
  const clock: Clock | null =
    remaining === null || limit === null
      ? null
      : { seconds: Math.ceil(remaining / 1000), fraction: remaining / (limit * 1000) };

  const toggle = (card: string) => {
    setError(null);
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(card)) {
        next.delete(card);
        return next;
      }
      if (myGive) {
        if (next.size >= myGive.count) next.delete([...next][0]!);
        next.add(card);
        return next;
      }
      // Jeu : une seule valeur à la fois ; on complète automatiquement au format du pli.
      if ([...next].some((c) => rankOfText(c) !== rankOfText(card))) next.clear();
      next.add(card);
      if (game.trickSize > 0) {
        const same = hand.filter((c) => rankOfText(c) === rankOfText(card) && !next.has(c));
        while (next.size < game.trickSize && same.length > 0) next.add(same.shift()!);
        while (next.size > game.trickSize) next.delete([...next].find((c) => c !== card)!);
      }
      return next;
    });
  };

  const forced = forcedRankOf(game.trick, game.trickSize);
  const selection = sortCards([...selected]);
  const problem = myTurn ? selectionProblem(selection, game.trickSize, game.trickRank, forced) : null;
  const playable = myTurn ? playableCards(hand, game.trickSize, game.trickRank, forced) : null;

  const act = (op: 'play' | 'pass' | 'give') =>
    startTransition(async () => {
      setError(null);
      const cards = op === 'pass' ? [] : selection;
      removeFromHand(cards);
      const r =
        op === 'pass'
          ? await conn.request({ op: 'pass', req: 0 })
          : await conn.request({ op, req: 0, cards: cards.map(parseCard) });
      if (r.ok) setSelected(new Set());
      else setError(r.message);
    });

  const pendingGivers = new Set(game.exchanges.filter((e) => !e.done).map((e) => e.from));
  const myPlayer: PlayerSnapshot | undefined = players[me];
  const messages = useChat();
  const unread = useUnread(messages, myPlayer?.id ?? '', myPlayer?.name, chatOpen);
  const now = conn.serverNow();
  // Seuls les sièges de la manche jouent (un joueur arrivé entre-temps attend la suivante).
  const seats = players.slice(0, game.counts.length);

  return (
    <Page className={`${styles.game} ${mustAct ? styles.myTurn : ''}`}>
      <TopBar title={`Manche ${game.roundNo}`} />

      <section className={styles.opponents} aria-label="Ordre de jeu">
        {seats.map((p, i) => {
          const acting = game.phase === 'playing' ? game.turn === p.seat : pendingGivers.has(p.seat);
          return (
            <Fragment key={p.id}>
              {i > 0 && (
                <span className={styles.arrow} aria-hidden="true">
                  ›
                </span>
              )}
              <OpponentChip
                player={p}
                game={game}
                isMe={p.seat === me}
                acting={acting}
                dim={mustAct && !acting}
                clock={acting ? clock : null}
                now={now}
              />
            </Fragment>
          );
        })}
      </section>

      <section className={`${styles.frame} ${mustAct ? styles.frameMyTurn : ''}`}>
        <div className={styles.felt}>
          <TrickArea game={game} nameOf={nameOf} />
          <EventBanner events={game.events} nameOf={nameOf} roundNo={game.roundNo} />
        </div>
      </section>

      {game.phase === 'exchange' && <ExchangePanel game={game} me={me} nameOf={nameOf} />}

      <section className={`${styles.me} ${mustAct ? styles.meTurn : styles.meIdle}`}>
        {mustAct && clock && <Timer clock={clock} />}
        <div className={styles.status}>
          <StatusLine game={game} me={me} myPlayer={myPlayer} nameOf={nameOf} clock={mustAct ? clock : null} />
        </div>
        {error && <Alert className={styles.error}>{error}</Alert>}
        <Hand
          cards={shownHand}
          selected={selected}
          onToggle={mustAct ? toggle : undefined}
          playable={myGive ? null : playable}
          active={mustAct}
        />
        <div className={styles.actions}>
          {myGive && (
            <Button variant="gold" disabled={pending || selection.length !== myGive.count} onClick={() => act('give')}>
              Donner {selection.length}/{myGive.count} carte{myGive.count > 1 ? 's' : ''} à {nameOf(myGive.to)}
            </Button>
          )}
          {myTurn && (
            <>
              <Button variant="ghost" disabled={pending || game.trickSize === 0} onClick={() => act('pass')}>
                Passer
              </Button>
              <Button variant="gold" disabled={pending || problem !== null} onClick={() => act('play')}>
                {problem ?? `Jouer ${selection.length > 1 ? `${selection.length} cartes` : 'la carte'}`}
              </Button>
            </>
          )}
        </div>
        <EmoteBar onSend={(emote) => conn.send({ op: 'emote', emote })}>
          <button
            type="button"
            className={`${styles.chatFab} ${unread.mentioned ? styles.chatPing : ''}`}
            onClick={() => setChatOpen(true)}
            aria-label={`Ouvrir le chat${unread.count ? ` (${unread.count} non lus)` : ''}`}
          >
            💬 Chat
            {unread.count > 0 && <span className={styles.badge}>{unread.mentioned ? '@' : unread.count}</span>}
          </button>
        </EmoteBar>
      </section>

      {chatOpen && (
        <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Chat">
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Fermer le chat"
            onClick={() => setChatOpen(false)}
          />
          <div className={styles.sheet}>
            <Chat drawer onClose={() => setChatOpen(false)} />
          </div>
        </div>
      )}
    </Page>
  );
}

function Timer({ clock }: { clock: Clock }) {
  return (
    <div className={`${styles.timer} ${clock.seconds <= 10 ? styles.urgent : ''}`} aria-hidden="true">
      <span style={{ transform: `scaleX(${clock.fraction})` }} />
    </div>
  );
}
