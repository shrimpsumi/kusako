import { db } from '../../db.js';
import {
  getBalance,
  modifyBalance,
  type ModifyResult,
} from '../economy/guild.js';

export const STAT_GAMES = [
  { id: 'blackjack', pushes: true },
  { id: 'coinflip', pushes: false },
  { id: 'roulette', pushes: false },
] as const;

export type StatGame = (typeof STAT_GAMES)[number]['id'];

export type GameResult = 'win' | 'loss' | 'push';

export interface GameStats {
  played: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  net: number;
  bestWin: number;
}

const EMPTY_STATS: GameStats = {
  played: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  net: 0,
  bestWin: 0,
};

interface Row {
  played: number;
  wins: number;
  losses: number;
  streak: number;
  best_streak: number;
  net: number;
  best_win: number;
}

function toModel(row: Row): GameStats {
  return {
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    streak: row.streak,
    bestStreak: row.best_streak,
    net: row.net,
    bestWin: row.best_win,
  };
}

export function pushesOf(stats: GameStats): number {
  return stats.played - stats.wins - stats.losses;
}

export function nextStats(
  prev: GameStats,
  result: GameResult,
  delta: number,
): GameStats {
  const streak =
    result === 'win' ? prev.streak + 1 : result === 'loss' ? 0 : prev.streak;

  return {
    played: prev.played + 1,
    wins: prev.wins + (result === 'win' ? 1 : 0),
    losses: prev.losses + (result === 'loss' ? 1 : 0),
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
    net: prev.net + delta,
    bestWin: Math.max(prev.bestWin, delta),
  };
}

export function getGameStats(
  guildId: string,
  userId: string,
  game: StatGame,
): GameStats | null {
  const row = db()
    .prepare(
      'SELECT * FROM game_stats WHERE guild_id = ? AND user_id = ? AND game = ?',
    )
    .get(guildId, userId, game) as Row | undefined;

  return row ? toModel(row) : null;
}

export function recordGame(
  guildId: string,
  userId: string,
  game: StatGame,
  result: GameResult,
  delta: number,
): GameStats {
  const run = db().transaction((): GameStats => {
    const prev = getGameStats(guildId, userId, game) ?? EMPTY_STATS;
    const next = nextStats(prev, result, delta);

    db()
      .prepare(
        `INSERT INTO game_stats
           (guild_id, user_id, game, played, wins, losses, streak, best_streak, net, best_win, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id, game)
         DO UPDATE SET
           played = excluded.played,
           wins = excluded.wins,
           losses = excluded.losses,
           streak = excluded.streak,
           best_streak = excluded.best_streak,
           net = excluded.net,
           best_win = excluded.best_win,
           updated_at = excluded.updated_at`,
      )
      .run(
        guildId,
        userId,
        game,
        next.played,
        next.wins,
        next.losses,
        next.streak,
        next.bestStreak,
        next.net,
        next.bestWin,
        Date.now(),
      );

    return next;
  });

  return run();
}

export function settleGame(
  guildId: string,
  userId: string,
  game: StatGame,
  result: GameResult,
  delta: number,
  credit: number,
): ModifyResult {
  const run = db().transaction((): ModifyResult => {
    const settled =
      credit !== 0
        ? modifyBalance(guildId, userId, credit, game)
        : { ok: true, balance: getBalance(guildId, userId) };
    if (!settled.ok) return settled;

    recordGame(guildId, userId, game, result, delta);
    return settled;
  });

  return run();
}
