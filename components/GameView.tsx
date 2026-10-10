'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FORMAT_LABELS,
  playableCards,
  rankOf,
  rankValueLabel,
  selectionProblem,
  sortCards,
} from '@/lib/cards';
import { ordinal, ROLE_INFO } from '@/lib/roles';
import type { Game, GameEvent, Player, TableState, TrickEntry } from '@/lib/types';
import { Card } from './Card';
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
  const myTurn = game.phase === 'playing' && game.turn === me;

  // Les cartes sélectionnées qui ont quitté la main sont oubliées.
  useEffect(() => {
    setSelected((sel) => {
      const kept = [...sel].filter((c) => hand.includes(c));
      return kept.length === sel.size ? sel : new Set(kept);
    });
  }, [hand]);

  // Notification discrète quand c'est à moi.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      if ('vibrate' in navigator) navigator.vibrate?.(80);
    }
    wasMyTurn.current = myTurn;
    document.title = myTurn ? '🔔 À vous ! — El Presidente' : 'El Presidente';
    return () => {
      document.title = 'El Presidente';
    };
  }, [myTurn]);

  // Échange : est-ce à moi de donner des cartes ?
  const myGive = game.phase === 'exchange' ? game.exchanges.find((e) => e.from === me && !e.done) : undefined;

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

  const selection = sortCards([...selected]);
  const problem = myTurn ? selectionProblem(selection, game.trick_size, game.trick_rank) : null;
  const playable = useMemo(
    () => (myTurn ? playableCards(hand, game.trick_size, game.trick_rank) : null),
    [myTurn, hand, game.trick_size, game.trick_rank],
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

  const seatOrder = game.seats.filter((id) => players.has(id));
  const meIdx = seatOrder.indexOf(me);
  const opponents = [...seatOrder.slice(meIdx + 1), ...seatOrder.slice(0, Math.max(meIdx, 0))]
    .map((id) => players.get(id))
    .filter((p): p is Player => !!p);
  const myPlayer = players.get(me);

  return (
    <main className="page game">
      <TopBar state={state} table={table} title={`Manche ${game.round_no}`} />

      <section className="opponents" aria-label="Adversaires">
        {opponents.map((p) => (
          <OpponentChip key={p.id} player={p} game={game} />
        ))}
      </section>

      <section className="felt-frame">
        <div className="felt">
          <TrickArea game={game} nameOf={nameOf} />
          <EventBanner events={game.events} nameOf={nameOf} roundNo={game.round_no} />
        </div>
      </section>

      {game.phase === 'exchange' && <ExchangePanel game={game} me={me} nameOf={nameOf} />}

      <section className={`me ${myTurn ? 'me--turn' : ''}`}>
        <div className="me__status">
          <StatusLine game={game} me={me} myPlayer={myPlayer} nameOf={nameOf} />
        </div>
        {table.actionError && (
          <p className="error" role="alert">
            {table.actionError}
          </p>
        )}
        <Hand
          cards={hand}
          selected={selected}
          onToggle={myTurn || myGive ? toggle : undefined}
          playable={myGive ? null : playable}
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
      </section>
    </main>
  );
}

function OpponentChip({ player, game }: { player: Player; game: Game }) {
  const turn = game.phase === 'playing' && game.turn === player.id;
  const position = game.finished.indexOf(player.id) + 1;
  const lastAction = [...game.trick].reverse().find((t) => t.p === player.id);
  const passed = !!lastAction?.pass;
  const role = player.role ? ROLE_INFO[player.role] : null;
  return (
    <div className={`chip ${turn ? 'chip--turn' : ''} ${position ? 'chip--out' : ''}`}>
      <div className="chip__name">
        {role && (
          <span className="chip__role" title={role.fr}>
            {role.icon}
          </span>
        )}
        {player.name}
      </div>
      <div className="chip__info">
        {position ? (
          <span className="chip__out">Sorti {ordinal(position)}</span>
        ) : (
          <span className="chip__cards" title={`${player.cards} cartes`}>
            <span className="chip__back" aria-hidden="true" />×{player.cards}
          </span>
        )}
        {turn && <span className="chip__thinking">joue…</span>}
        {!turn && passed && <span className="chip__pass">passe</span>}
      </div>
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
          <div className="trick__format">
            {FORMAT_LABELS[game.trick_size]} · {rankValueLabel(game.trick_rank)} ou plus
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
}: {
  game: Game;
  me: string;
  myPlayer?: Player;
  nameOf: (id: string) => string;
}) {
  const role = myPlayer?.role ? ROLE_INFO[myPlayer.role] : null;
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
          À vous ! {FORMAT_LABELS[game.trick_size]}, {rankValueLabel(game.trick_rank)} ou plus
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
