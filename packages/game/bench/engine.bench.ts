// Micro-banc du chemin chaud : coup, passe automatique, encodage d'un delta.
//   bun run bench

import { bench, run, summary } from 'mitata';
import { autoMove, forcedRank, playCards, startRound } from '../src/engine';
import { cardsOf } from '../src/hand';
import { legalPlays } from '../src/hints';
import { Writer } from '../src/protocol/buffer';
import { moveDelta } from '../src/protocol/delta';
import { decodeClient, encodeServer } from '../src/protocol/messages';
import { seededRng } from '../src/random';

const rng = seededRng(1);
const fresh = () => {
  const r = startRound({ players: 6, roundNo: 1, roles: Array(6).fill(null), rng, now: 0 });
  if (r.isErr()) throw r.error;
  return r.value.state;
};

summary(() => {
  bench('manche complète (6 joueurs, coups légaux)', () => {
    const g = fresh();
    while (g.phase !== 'over') {
      const plays = legalPlays(cardsOf(g.hands, g.turn), g.trickSize, g.trickRank, forcedRank(g.trick, g.trickSize));
      if (plays.length === 0) autoMove(g, 0);
      else playCards(g, g.turn, plays[0]!, 0);
    }
  });

  const w = new Writer();
  const g = fresh();
  const delta = moveDelta(g, 1, { kind: 'play', seat: 0, cards: [4, 5], count: 2 }, []);
  bench('encodage d’un delta de coup', () => encodeServer(w, { op: 'move', ...delta }));

  const play = new Uint8Array([0x01, 0, 7, 2, 20, 21]);
  bench('décodage d’un coup client', () => decodeClient(play));
});

await run();
