import { describe, expect, test } from 'vitest';
import { arrangeHand } from './hand-order';

describe('ordre de la main', () => {
  const hand = ['3C', '3H', '5D', '7C', '7D', '7S', '9H', 'KC', 'KS', '2D'];

  test('par valeur : inchangée, sans séparation', () => {
    expect(arrangeHand(hand, 'rank')).toEqual({ cards: hand, breaks: new Set() });
  });

  test('par combinaisons : simples, paires, brelans, chacun par valeur', () => {
    const { cards, breaks } = arrangeHand(hand, 'groups');
    expect(cards).toEqual(['5D', '9H', '2D', '3C', '3H', 'KC', 'KS', '7C', '7D', '7S']);
    expect([...breaks]).toEqual(['3C', '7C']);
  });
});
