import { db } from '../db.js';

export function getCooldownRemaining(
  guildId: string,
  triggerKey: string,
  userId: string,
): number {
  const row = db()
    .prepare(
      `SELECT expires_at FROM ar_cooldowns
       WHERE guild_id = ? AND trigger_key = ? AND user_id = ?`,
    )
    .get(guildId, triggerKey, userId) as { expires_at: number } | undefined;

  if (!row) return 0;

  const remainingMs = row.expires_at - Date.now();
  if (remainingMs <= 0) {
    db()
      .prepare(
        `DELETE FROM ar_cooldowns
         WHERE guild_id = ? AND trigger_key = ? AND user_id = ?`,
      )
      .run(guildId, triggerKey, userId);
    return 0;
  }

  return Math.ceil(remainingMs / 1000);
}

export function setCooldown(
  guildId: string,
  triggerKey: string,
  userId: string,
  seconds: number,
): void {
  db()
    .prepare(
      `INSERT INTO ar_cooldowns (guild_id, trigger_key, user_id, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, trigger_key, user_id)
       DO UPDATE SET expires_at = excluded.expires_at`,
    )
    .run(guildId, triggerKey, userId, Date.now() + seconds * 1000);
}
