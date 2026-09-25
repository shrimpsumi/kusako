import {
  createDeck,
  handValue,
  isBust,
  isBlackjack,
  shouldDealerHit,
  type Card,
} from './cards.js';
import { createHands, type Hand } from './hands.js';
import type { GameResult } from './stats.js';

export interface BlackjackGame extends Hand {
  bet: number;
  deck: Card[];
  player: Card[];
  dealer: Card[];
  doubled: boolean;
}

export type Outcome = 'blackjack' | 'win' | 'lose' | 'push' | 'bust';

const games = createHands<BlackjackGame>();

export function getGame(guildId: string, userId: string): BlackjackGame | null {
  return games.get(guildId, userId);
}

export function hasGame(guildId: string, userId: string): boolean {
  return games.has(guildId, userId);
}

export function startGame(
  guildId: string,
  userId: string,
  bet: number,
  onTimeout: (game: BlackjackGame) => void,
): BlackjackGame {
  const deck = createDeck();
  const player = [deck.pop()!, deck.pop()!];
  const dealer = [deck.pop()!, deck.pop()!];

  const game: BlackjackGame = {
    guildId,
    userId,
    bet,
    deck,
    player,
    dealer,
    doubled: false,
    onTimeout,
  };

  games.add(game);
  return game;
}

export function hit(game: BlackjackGame): Card {
  const card = game.deck.pop()!;
  game.player.push(card);
  games.arm(game);
  return card;
}

export function canDouble(game: BlackjackGame): boolean {
  return game.player.length === 2 && !game.doubled;
}

export function doubleDown(game: BlackjackGame): Card {
  game.bet *= 2;
  game.doubled = true;
  const card = game.deck.pop()!;
  game.player.push(card);
  return card;
}

export function dealerPlay(game: BlackjackGame): void {
  if (isBust(game.player) || isBlackjack(game.player)) return;

  while (shouldDealerHit(game.dealer)) {
    game.dealer.push(game.deck.pop()!);
  }
}

export function resolve(game: BlackjackGame): Outcome {
  const playerVal = handValue(game.player);
  const dealerVal = handValue(game.dealer);

  if (isBust(game.player)) return 'bust';
  if (isBlackjack(game.player) && !isBlackjack(game.dealer)) return 'blackjack';
  if (isBlackjack(game.dealer) && !isBlackjack(game.player)) return 'lose';
  if (isBlackjack(game.player) && isBlackjack(game.dealer)) return 'push';
  if (isBust(game.dealer)) return 'win';
  if (playerVal > dealerVal) return 'win';
  if (playerVal < dealerVal) return 'lose';
  return 'push';
}

export function payout(bet: number, outcome: Outcome): number {
  if (outcome === 'blackjack') return Math.floor(bet * 1.5);
  if (outcome === 'win') return bet;
  if (outcome === 'push') return 0;
  return -bet;
}

export function credit(bet: number, outcome: Outcome): number {
  return bet + payout(bet, outcome);
}

export function resultOf(outcome: Outcome): GameResult {
  if (outcome === 'blackjack' || outcome === 'win') return 'win';
  if (outcome === 'push') return 'push';
  return 'loss';
}

export function endGame(guildId: string, userId: string): void {
  games.remove(guildId, userId);
}
