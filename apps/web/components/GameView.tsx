'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORMAT_LABELS,
  forcedRank,
  playableCards,
  rankOf,
  rankValueLabel,
  selectionProblem,
  sortCards,
} from '@/lib/cards';
import { ordinal, ROLE_INFO } from '@/lib/roles';
import type { Game, GameEvent, Player, TableState, TrickEntry } from '@/lib/types';
import type { LiveEmote } from '@/lib/useTable';
import { Card } from './Card';
import Chat, { useUnread } from './Chat';
import { EmoteBar, EmoteBubble } from './Emotes';
import EventBanner from './EventBanner';
import Hand from './Hand';
import TopBar from './TopBar';
import type { TableApi } from './TableRoom';

export default function GameView({ state, table }: { state: TableState; table: TableApi }) {
  const game = state.game as Game;
  const me = state.me as string;
  const hand = useMemo(() => sortCards(state.hand ?? []), [state.hand]);
  const players = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const nameOf = (id: string | null | undefined) => (id && players.get(id)?.name) || '?';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const myTurn = game.phase === 'playing' && game.turn === me;

  // Les cartes sélectionnées qui ont quitté la main sont oubliées.
  useEffect(() => {
    setSelected((sel) => {
      const kept = [...sel].filter((c) => hand.includes(c));
      return kept.length === sel.size ? sel : new Set(kept);
    });
  }, [hand]);

  // Échange : est-ce à moi de donner des cartes ?
  const myGive = game.phase === 'exchange' ? game.exchanges.find((e) => e.from === me && !e.done) : undefined;
  const mustAct = myTurn || !!myGive;

  // Notification discrète quand c'est à moi.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (mustAct && !wasMyTurn.current) {
      if ('vibrate' in navigator) navigator.vibrate?.(80);
    }
    wasMyTurn.current = mustAct;
    document.title = mustAct ? '🔔 À vous ! — El Presidente' : 'El Presidente';
    return () => {
      document.title = 'El Presidente';
    };
  }, [mustAct]);

  // Délai par tour : chrono affiché à tous ; à zéro, on demande au serveur
  // d'appliquer la passe automatique (il vérifie lui-même le délai).
  const limit = state.lobby.turn_limit;
  const timed = !!limit && (game.phase === 'playing' || game.phase === 'exchange');
  const deadline = timed ? game.turn_started + (limit as number) * 1000 : null;
  const remaining = useCountdown(deadline, table.serverNow);
  const expired = remaining === 0;
  const { claimTimeout } = table;
  useEffect(() => {
    if (!expired) return;
    const first = setTimeout(claimTimeout, 200 + Math.random() * 800);
    const retry = setInterval(claimTimeout, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(retry);
    };
  }, [expired, game.turn_started, claimTimeout]);
  const clock: Clock | null =
    remaining === null || !limit ? null : { seconds: Math.ceil(remaining / 1000), fraction: remaining / (limit * 1000) };

  const toggle = (card: string) => {
    table.setActionError(null);
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(card)) {
        next.delete(card);
        return next;
      }
      if (myGive) {
        if (next.size >= myGive.count) next.delete([...next][0]);
        next.add(card);
        return next;
      }
      // Jeu : une seule valeur à la fois ; on complète automatiquement au format du pli.
      if ([...next].some((c) => rankOf(c) !== rankOf(card))) next.clear();
      next.add(card);
      if (game.trick_size > 0) {
        const same = hand.filter((c) => rankOf(c) === rankOf(card) && !next.has(c));
        while (next.size < game.trick_size && same.length) next.add(same.shift() as string);
        while (next.size > game.trick_size) next.delete([...next].find((c) => c !== card) as string);
      }
      return next;
    });
  };

  const forced = forcedRank(game.trick, game.trick_size);
  const selection = sortCards([...selected]);
  const problem = myTurn ? selectionProblem(selection, game.trick_size, game.trick_rank, forced) : null;
  const playable = useMemo(
    () => (myTurn ? playableCards(hand, game.trick_size, game.trick_rank, forced) : null),
    [myTurn, hand, game.trick_size, game.trick_rank, forced],
  );

  const play = async () => {
    if (await table.act('play_cards', { p_cards: selection })) setSelected(new Set());
  };
  const pass = async () => {
    if (await table.act('pass_turn')) setSelected(new Set());
  };
  const give = async () => {
    if (await table.act('give_cards', { p_cards: selection })) setSelected(new Set());
  };

  // Tous les joueurs dans l'ordre du tour, moi compris, pour savoir où l'on se situe.
  const seatOrder = game.seats.filter((id) => players.has(id));
  const myPlayer = players.get(me);
  const pendingGivers = new Set(game.exchanges.filter((e) => !e.done).map((e) => e.from));
  const myName = myPlayer?.name;
  const unread = useUnread(table.messages, me, myName, chatOpen);

  return (
    <main className={`page game ${mustAct ? 'game--myturn' : ''}`}>
      <TopBar state={state} table={table} title={`Manche ${game.round_no}`} />

      <section className="opponents" aria-label="Ordre de jeu">
        {seatOrder.map((id, i) => {
          const p = players.get(id) as Player;
          const acting = game.phase === 'playing' ? game.turn === id : pendingGivers.has(id);
          return (
            <Fragment key={id}>
              {i > 0 && (
                <span className="opponents__arrow" aria-hidden="true">
                  ›
                </span>
              )}
              <OpponentChip
                player={p}
                game={game}
                isMe={id === me}
                acting={acting}
                clock={acting ? clock : null}
                emote={table.emotes[id]}
              />
            </Fragment>
          );
        })}
      </section>

      <section className={`felt-frame ${mustAct ? 'felt-frame--myturn' : ''}`}>
        <div className="felt">
          <TrickArea game={game} nameOf={nameOf} />
          <EventBanner events={game.events} nameOf={nameOf} roundNo={game.round_no} />
        </div>
      </section>

      {game.phase === 'exchange' && <ExchangePanel game={game} me={me} nameOf={nameOf} />}

      <section className={`me ${mustAct ? 'me--turn' : 'me--idle'}`}>
        {mustAct && clock && (
          <div className={`me__timer ${clock.seconds <= 10 ? 'me__timer--urgent' : ''}`} aria-hidden="true">
            <span style={{ transform: `scaleX(${clock.fraction})` }} />
          </div>
        )}
        <div className="me__status">
          <StatusLine game={game} me={me} myPlayer={myPlayer} nameOf={nameOf} clock={mustAct ? clock : null} />
        </div>
        {table.actionError && (
          <p className="error" role="alert">
            {table.actionError}
          </p>
        )}
        <Hand
          cards={hand}
          selected={selected}
          onToggle={mustAct ? toggle : undefined}
          playable={myGive ? null : playable}
          active={mustAct}
        />
        <div className="me__actions">
          {myGive && (
            <button
              type="button"
              className="btn btn--gold"
              disabled={table.busy || selection.length !== myGive.count}
              onClick={give}
            >
              Donner {selection.length}/{myGive.count} carte{myGive.count > 1 ? 's' : ''} à {nameOf(myGive.to)}
            </button>
          )}
          {myTurn && (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={table.busy || game.trick_size === 0}
                onClick={pass}
              >
                Passer
              </button>
              <button type="button" className="btn btn--gold" disabled={table.busy || !!problem} onClick={play}>
                {problem ?? `Jouer ${selection.length > 1 ? `${selection.length} cartes` : 'la carte'}`}
              </button>
            </>
          )}
        </div>
        <EmoteBar onSend={table.sendEmote}>
          <button
            type="button"
            className={`chat-fab ${unread.mentioned ? 'chat-fab--ping' : ''}`}
            onClick={() => setChatOpen(true)}
            aria-label={`Ouvrir le chat${unread.count ? ` (${unread.count} non lus)` : ''}`}
          >
            💬 Chat
            {unread.count > 0 && <span className="chat-fab__badge">{unread.mentioned ? '@' : unread.count}</span>}
          </button>
        </EmoteBar>
      </section>

      {chatOpen && (
        <div className="chat-drawer" role="dialog" aria-label="Chat" onClick={() => setChatOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Chat state={state} table={table} onClose={() => setChatOpen(false)} className="chat--drawer" />
          </div>
        </div>
      )}
    </main>
  );
}

type Clock = { seconds: number; fraction: number };

/** Temps restant (ms) avant l'échéance, selon l'horloge du serveur ; null sans échéance. */
function useCountdown(deadline: number | null, serverNow: () => number) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (deadline === null) return;
    setNow(serverNow());
    const timer = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(timer);
  }, [deadline, serverNow]);
  return deadline === null ? null : Math.max(0, deadline - now);
}

function OpponentChip({
  player,
  game,
  isMe,
  acting,
  clock,
  emote,
}: {
  player: Player;
  game: Game;
  isMe: boolean;
  acting: boolean;
  clock: Clock | null;
  emote?: LiveEmote;
}) {
  const position = game.finished.indexOf(player.id) + 1;
  const lastAction = [...game.trick].reverse().find((t) => t.p === player.id);
  const passed = !!lastAction?.pass;
  const role = player.role ? ROLE_INFO[player.role] : null;
  return (
    <div
      className={`chip ${acting ? 'chip--turn' : ''} ${position ? 'chip--out' : ''} ${isMe ? 'chip--me' : ''}`}
      aria-current={acting ? 'true' : undefined}
    >
      <EmoteBubble emote={emote} />
      <div className="chip__name">
        {role && (
          <span className="chip__role" title={role.fr}>
            {role.icon}
          </span>
        )}
        {isMe ? 'Vous' : player.name}
        {!isMe && !player.online && (
          <span className="chip__away" title="Absent : page fermée ou en arrière-plan">
            💤
          </span>
        )}
      </div>
      <div className="chip__info">
        {position ? (
          <span className="chip__out">Sorti {ordinal(position)}</span>
        ) : (
          <span className="chip__cards" title={`${player.cards} cartes`}>
            <span className="chip__back" aria-hidden="true" />×{player.cards}
          </span>
        )}
        {acting && <span className="chip__thinking">{clock ? `${clock.seconds} s` : isMe ? 'à vous !' : 'joue…'}</span>}
        {!acting && passed && <span className="chip__pass">passe</span>}
      </div>
      {clock && (
        <span className="chip__timer" aria-hidden="true">
          <span style={{ transform: `scaleX(${clock.fraction})` }} />
        </span>
      )}
    </div>
  );
}

const ROTATIONS = [-7, 5, -3, 8, -5, 3];

function TrickPile({ entries, nameOf, faded }: { entries: TrickEntry[]; nameOf: (id: string) => string; faded?: boolean }) {
  const plays = entries.filter((e): e is { p: string; c: string[] } => !!e.c).slice(-4);
  return (
    <div className={`pile ${faded ? 'pile--faded' : ''}`}>
      {plays.map((play, i) => {
        const depth = plays.length - 1 - i;
        return (
          <div
            key={`${play.p}-${play.c.join('')}`}
            className={`pile__play ${depth === 0 ? 'pile__play--top' : ''}`}
            style={{
              transform: `translate(${-depth * 14}px, ${-depth * 10}px) rotate(${ROTATIONS[(i + plays.length) % ROTATIONS.length]}deg) scale(${1 - depth * 0.08})`,
              zIndex: i,
            }}
          >
            <div className="pile__cards">
              {play.c.map((c) => (
                <Card key={c} card={c} className="pile__card" />
              ))}
            </div>
            {depth === 0 && <span className="pile__who">{nameOf(play.p)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function TrickArea({ game, nameOf }: { game: Game; nameOf: (id: string) => string }) {
  const forced = forcedRank(game.trick, game.trick_size);
  const hasTrick = game.trick.some((t) => t.c);
  if (game.phase === 'exchange') {
    return (
      <div className="trick">
        <p className="trick__hint title-rye">Intercambio de cartas…</p>
      </div>
    );
  }
  return (
    <div className="trick">
      {hasTrick ? (
        <>
          <div className={`trick__format ${forced ? 'trick__format--forced' : ''}`}>
            {FORMAT_LABELS[game.trick_size]} ·{' '}
            {forced ? `${rankValueLabel(forced)} ou rien !` : `${rankValueLabel(game.trick_rank)} ou plus`}
          </div>
          <TrickPile entries={game.trick} nameOf={nameOf} />
        </>
      ) : game.prev_trick.some((t) => t.c) ? (
        <>
          <div className="trick__format trick__format--soft">Pli pour {nameOf(game.prev_winner ?? '')}</div>
          <TrickPile entries={game.prev_trick} nameOf={nameOf} faded />
        </>
      ) : (
        <p className="trick__hint title-rye">La mesa está lista</p>
      )}
    </div>
  );
}

function StatusLine({
  game,
  me,
  myPlayer,
  nameOf,
  clock,
}: {
  game: Game;
  me: string;
  myPlayer?: Player;
  nameOf: (id: string) => string;
  clock: Clock | null;
}) {
  const role = myPlayer?.role ? ROLE_INFO[myPlayer.role] : null;
  const forced = forcedRank(game.trick, game.trick_size);
  const myPosition = game.finished.indexOf(me) + 1;
  let text: React.ReactNode;
  if (myPosition) {
    text = <>Vous êtes sorti {ordinal(myPosition)} ! Regardez les autres se battre…</>;
  } else if (game.phase === 'exchange') {
    text = <>Échange des cartes en cours</>;
  } else if (game.turn === me) {
    text =
      game.trick_size === 0 ? (
        <strong>À vous d&apos;ouvrir le pli !</strong>
      ) : (
        <strong>
          À vous ! {FORMAT_LABELS[game.trick_size]},{' '}
          {forced ? `${rankValueLabel(forced)} ou rien` : `${rankValueLabel(game.trick_rank)} ou plus`}
        </strong>
      );
  } else {
    text = <>{nameOf(game.turn ?? '')} réfléchit…</>;
  }
  return (
    <>
      <span className="me__name">
        {role && <span title={role.fr}>{role.icon} </span>}
        {myPlayer?.name}
      </span>
      <span className="me__text">{text}</span>
      {clock && (
        <span className={`me__clock ${clock.seconds <= 10 ? 'me__clock--urgent' : ''}`}>
          ⏱ {clock.seconds} s
        </span>
      )}
    </>
  );
}

function ExchangePanel({ game, me, nameOf }: { game: Game; me: string; nameOf: (id: string) => string }) {
  const lines: React.ReactNode[] = [];
  for (const e of game.exchanges) {
    if (e.from === me && e.done && e.cards) {
      lines.push(
        <div key={`g-${e.to}`} className="exchange__line">
          Vous avez donné à {nameOf(e.to)} :
          <MiniCards cards={e.cards} />
        </div>,
      );
    } else if (e.to === me && e.done && e.cards) {
      lines.push(
        <div key={`r-${e.from}`} className="exchange__line">
          {nameOf(e.from)} vous a donné :
          <MiniCards cards={e.cards} />
        </div>,
      );
    } else if (e.to === me && !e.done) {
      lines.push(
        <div key={`w-${e.from}`} className="exchange__line muted">
          {nameOf(e.from)} choisit {e.count} carte{e.count > 1 ? 's' : ''} à vous donner…
        </div>,
      );
    } else if (e.from === me && !e.done) {
      lines.push(
        <div key={`c-${e.to}`} className="exchange__line">
          <strong>
            Choisissez {e.count} carte{e.count > 1 ? 's' : ''} à donner à {nameOf(e.to)}.
          </strong>
        </div>,
      );
    }
  }
  if (lines.length === 0) {
    const pending = game.exchanges.filter((e) => !e.done).map((e) => nameOf(e.from));
    lines.push(
      <div key="others" className="exchange__line muted">
        {pending.length ? `${pending.join(' et ')} choisi${pending.length > 1 ? 'ssent' : 't'} les cartes à rendre…` : ''}
      </div>,
    );
  }
  return (
    <section className="panel exchange">
      <h3 className="title-rye">Intercambio</h3>
      {lines}
    </section>
  );
}

function MiniCards({ cards }: { cards: string[] }) {
  return (
    <span className="minicards">
      {sortCards(cards).map((c) => (
        <Card key={c} card={c} className="minicards__card" />
      ))}
    </span>
  );
}

export type { GameEvent };
