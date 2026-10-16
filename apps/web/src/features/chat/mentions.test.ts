import { describe, expect, test } from 'vitest';
import { mergeMessages } from './keys';
import { mentions, splitMentions } from './mentions';

const m = (id: number) => ({ id, p: null, name: 'x', body: String(id), at: id });

describe('mentions', () => {
  test('noms avec espaces, le plus long d’abord, sans tenir compte de la casse', () => {
    expect(splitMentions('salut @ana maría et @Ana !', ['Ana', 'Ana María'])).toEqual([
      { text: 'salut ' },
      { text: '@ana maría', mention: 'Ana María' },
      { text: ' et ' },
      { text: '@Ana', mention: 'Ana' },
      { text: ' !' },
    ]);
    expect(mentions('Allez @carla', 'Carla')).toBe(true);
    expect(mentions('Allez carla', 'Carla')).toBe(false);
  });

  test('fusion de l’historique et du direct, sans doublon', () => {
    expect(mergeMessages([m(1), m(3)], [m(2), m(3)]).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});
