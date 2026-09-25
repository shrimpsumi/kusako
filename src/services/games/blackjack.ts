import {
  createDeck,
  handValue,
  isBust,
  isBlackjack,
  shouldDealerHit,
  type Card,
} from './cards.js';
import type { GameResult } from './stats.js';

export interface BlackjackGame {
  guildId: string;
  userId: string;
  bet: number;
  deck: Card[];
  player: Card[];
  dealer: Card[];
  doubled: boolean;
  onTimeout: (game: BlackjackGame) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

export type Outcome = 'blackjack' | 'win' | 'lose' | 'push' | 'bust';

const TIMEOUT_MS = 60_000;

const games = new Map<string, BlackjackGame>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function getGame(guildId: string, userId: string): BlackjackGame | null {
  return games.get(key(guildId, userId)) ?? null;
}

export function hasGame(guildId: string, userId: string): boolean {
  return games.has(key(guildId, userId));
}

function clearGame(guildId: string, userId: string): void {
  const k = key(guildId, userId);
  const game = games.get(k);
  if (game) {
    clearTimeout(game.timeout);
    games.delete(k);
  }
}

export function startGame(
  guildId: string,
  userId: string,
  bet: number,
  onTimeout: (game: BlackjackGame) => void,
): BlackjackGame {
  clearGame(guildId, userId);

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

  games.set(key(guildId, userId), game);
  armTimeout(game);
  return game;
}

export function hit(game: BlackjackGame): Card {
  const card = game.deck.pop()!;
  game.player.push(card);
  armTimeout(game);
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
  clearGame(guildId, userId);
}

function armTimeout(game: BlackjackGame): void {
  clearTimeout(game.timeout);
  game.timeout = setTimeout(() => {
    const k = key(game.guildId, game.userId);
    if (games.get(k) === game) {
      games.delete(k);
      game.onTimeout(game);
    }
  }, TIMEOUT_MS);
}
