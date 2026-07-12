import { db } from './db.js';
import { getGuildSetting, setGuildSetting } from './settings.js';

export const XP_MIN = 1;
export const XP_MAX = 10;
export const XP_COOLDOWN_SECONDS = 60;
export const MAX_LEVEL = 1000;

export function totalXpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2));
  while (totalXpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && totalXpForLevel(level) > xp) level -= 1;
  return Math.min(level, MAX_LEVEL);
}

export function isLevelingEnabled(guildId: string): boolean {
  return getGuildSetting(guildId, 'levels.enabled') === '1';
}

export function setLevelingEnabled(guildId: string, enabled: boolean): void {
  setGuildSetting(guildId, 'levels.enabled', enabled ? '1' : '0');
}

export function getXp(guildId: string, userId: string): number {
  const row = db()
    .prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as { xp: number } | undefined;

  return row ? row.xp : 0;
}

export interface XpResult {
  ok: boolean;
  xp: number;
}

export function modifyXp(
  guildId: string,
  userId: string,
  delta: number,
): XpResult {
  const amount = Math.trunc(delta);
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, xp: getXp(guildId, userId) };
  }

  const run = db().transaction((): XpResult => {
    const current = getXp(guildId, userId);
    const next = current + amount;
    if (next < 0 || !Number.isSafeInteger(next)) {
      return { ok: false, xp: current };
    }

    db()
      .prepare(
        `INSERT INTO levels (guild_id, user_id, xp, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET xp = excluded.xp, updated_at = excluded.updated_at`,
      )
      .run(guildId, userId, next, Date.now());

    return { ok: true, xp: next };
  });

  return run();
}

export function setXp(
  guildId: string,
  userId: string,
  value: number,
): XpResult {
  const target = Math.trunc(value);
  if (!Number.isSafeInteger(target) || target < 0) {
    return { ok: false, xp: getXp(guildId, userId) };
  }

  const run = db().transaction(
    (): XpResult => modifyXp(guildId, userId, target - getXp(guildId, userId)),
  );

  return run();
}
