import { db } from '../../db.js';
import type { BirthdayDate, MonthDay } from './dates.js';

export interface Birthday {
  guildId: string;
  userId: string;
  month: number;
  day: number;
  year: number | null;
  timezone: string | null;
  lastFiredYear: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  guild_id: string;
  user_id: string;
  month: number;
  day: number;
  year: number | null;
  timezone: string | null;
  last_fired_year: number | null;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): Birthday {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    month: row.month,
    day: row.day,
    year: row.year,
    timezone: row.timezone,
    lastFiredYear: row.last_fired_year,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sortKey(month: number, day: number): number {
  return month * 100 + day;
}

export function getBirthday(guildId: string, userId: string): Birthday | null {
  const row = db()
    .prepare('SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as Row | undefined;

  return row ? toModel(row) : null;
}

export function setBirthday(
  guildId: string,
  userId: string,
  date: BirthdayDate,
  timezone: string | null,
): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO birthdays
         (guild_id, user_id, month, day, year, timezone, last_fired_year, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET
         month = excluded.month,
         day = excluded.day,
         year = excluded.year,
         timezone = excluded.timezone,
         last_fired_year = CASE
           WHEN birthdays.month = excluded.month AND birthdays.day = excluded.day
           THEN birthdays.last_fired_year
           ELSE NULL
         END,
         updated_at = excluded.updated_at`,
    )
    .run(guildId, userId, date.month, date.day, date.year, timezone, now, now);
}

export function removeBirthday(guildId: string, userId: string): boolean {
  const result = db()
    .prepare('DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?')
    .run(guildId, userId);

  return result.changes > 0;
}

export function stampFired(
  guildId: string,
  userId: string,
  year: number,
): void {
  db()
    .prepare(
      `UPDATE birthdays SET last_fired_year = ?, updated_at = ?
       WHERE guild_id = ? AND user_id = ?`,
    )
    .run(year, Date.now(), guildId, userId);
}

export function dueBirthdays(candidates: MonthDay[]): Birthday[] {
  if (candidates.length === 0) return [];

  const where = candidates.map(() => '(month = ? AND day = ?)').join(' OR ');
  const params = candidates.flatMap((date) => [date.month, date.day]);

  const rows = db()
    .prepare(`SELECT * FROM birthdays WHERE ${where} ORDER BY guild_id`)
    .all(...params) as Row[];

  return rows.map(toModel);
}

export function upcomingBirthdays(
  guildId: string,
  today: MonthDay,
  limit: number,
): Birthday[] {
  const rows = db()
    .prepare(
      `SELECT * FROM birthdays WHERE guild_id = ?
       ORDER BY CASE WHEN month * 100 + day >= ? THEN 0 ELSE 1 END,
                month * 100 + day
       LIMIT ?`,
    )
    .all(guildId, sortKey(today.month, today.day), limit) as Row[];

  return rows.map(toModel);
}

export function countBirthdays(guildId: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM birthdays WHERE guild_id = ?')
    .get(guildId) as { n: number };

  return row.n;
}
