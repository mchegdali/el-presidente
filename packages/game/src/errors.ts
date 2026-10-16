import { TaggedError } from 'better-result';

export type GameRuleReason =
  | 'not_enough_players'
  | 'too_many_players'
  | 'no_round'
  | 'not_your_turn'
  | 'card_count'
  | 'not_your_cards'
  | 'mixed_ranks'
  | 'wrong_format'
  | 'forced_rank'
  | 'too_low'
  | 'must_open'
  | 'no_exchange'
  | 'nothing_to_give'
  | 'give_count';

/** Coup refusé par les règles. Le message est destiné au joueur. */
export class GameRuleError extends TaggedError('GameRuleError')<{
  reason: GameRuleReason;
  message: string;
}> {}

export const ruleError = (reason: GameRuleReason, message: string) => new GameRuleError({ reason, message });
