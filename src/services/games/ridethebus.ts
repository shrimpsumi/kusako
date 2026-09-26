import { createDeck, type Card, type Rank, type Suit } from './cards.js';
import { createHands, type Hand } from './hands.js';
import type { GameResult } from './stats.js';

export type Pick =
  | 'red'
  | 'black'
  | 'higher'
  | 'lower'
  | 'inside'
  | 'outside'
  | Suit;

export const ROUNDS: { picks: Pick[]; pays: number }[] = [
  { picks: ['red', 'black'], pays: 2 },
  { picks: ['higher', 'lower'], pays: 3 },
  { picks: ['inside', 'outside'], pays: 5 },
  { picks: ['hearts', 'diamonds', 'clubs', 'spades'], pays: 10 },
];

const RANK_VALUES: Record<Rank, number> = {
  '02': 2,
  '03': 3,
  '04': 4,
  '05': 5,
  '06': 6,
  '07': 7,
  '08': 8,
  '09': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export interface BusGame extends Hand {
  bet: number;
  deck: Card[];
  cards: Card[];
}

const games = createHands<BusGame>();

export function rankValue(card: Card): number {
  return RANK_VALUES[card.rank];
}

function isRed(card: Card): boolean {
  return card.suit === 'hearts' || card.suit === 'diamonds';
}

export function isCorrect(prev: Card[], card: Card, pick: Pick): boolean {
  const value = rankValue(card);

  if (pick === 'red') return isRed(card);
  if (pick === 'black') return !isRed(card);
  if (pick === 'higher') return value > rankValue(prev[0]!);
  if (pick === 'lower') return value < rankValue(prev[0]!);

  if (pick === 'inside' || pick === 'outside') {
    const low = Math.min(rankValue(prev[0]!), rankValue(prev[1]!));
    const high = Math.max(rankValue(prev[0]!), rankValue(prev[1]!));
    return pick === 'inside'
      ? value > low && value < high
      : value < low || value > high;
  }

  return card.suit === pick;
}

export function isTie(prev: Card[], card: Card): boolean {
  if (prev.length !== 1 && prev.length !== 2) return false;
  return prev.some((p) => rankValue(p) === rankValue(card));
}

export function getGame(guildId: string, userId: string): BusGame | null {
  return games.get(guildId, userId);
}

export function hasGame(guildId: string, userId: string): boolean {
  return games.has(guildId, userId);
}

export function startGame(
  guildId: string,
  userId: string,
  bet: number,
  onTimeout: (game: BusGame) => void,
): BusGame {
  const game: BusGame = {
    guildId,
    userId,
    bet,
    deck: createDeck(),
    cards: [],
    onTimeout,
  };

  games.add(game);
  return game;
}

export function canPick(game: BusGame, pick: Pick): boolean {
  return ROUNDS[game.cards.length]?.picks.includes(pick) ?? false;
}

export function play(game: BusGame, pick: Pick): boolean {
  const card = game.deck.pop()!;
  const correct = isCorrect(game.cards, card, pick);
  game.cards.push(card);
  if (correct) games.arm(game);
  return correct;
}

export function isCleared(game: BusGame): boolean {
  return game.cards.length === ROUNDS.length;
}

export function credit(game: BusGame): number {
  const won = ROUNDS[game.cards.length - 1];
  return won ? game.bet * won.pays : 0;
}

export function resultOf(credit: number): GameResult {
  return credit > 0 ? 'win' : 'loss';
}

export function endGame(guildId: string, userId: string): void {
  games.remove(guildId, userId);
}
