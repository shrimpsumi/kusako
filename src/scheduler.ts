import type { Client } from 'discord.js';

import { db } from './db.js';
import { logger } from './logger.js';

interface ScheduledRow {
  id: number;
  channel_id: string;
  content: string;
  send_at: number;
}

const SWEEP_MS = 2000;

let sweeping: NodeJS.Timeout | null = null;

export function scheduleMessage(
  channelId: string,
  content: string,
  delaySeconds: number,
): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO scheduled_messages (channel_id, content, send_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(channelId, content, now + delaySeconds * 1000, now);
}

export function startScheduler(client: Client): void {
  if (sweeping) return;

  const pending = db()
    .prepare('SELECT COUNT(*) AS n FROM scheduled_messages')
    .get() as { n: number };
  if (pending.n > 0) {
    logger.info(`scheduler: ${pending.n} pending message(s) survived restart`);
  }

  sweeping = setInterval(() => {
    void sweep(client);
  }, SWEEP_MS);
}

export function stopScheduler(): void {
  if (!sweeping) return;
  clearInterval(sweeping);
  sweeping = null;
}

async function sweep(client: Client): Promise<void> {
  const due = db()
    .prepare(
      'SELECT * FROM scheduled_messages WHERE send_at <= ? ORDER BY send_at LIMIT 10',
    )
    .all(Date.now()) as ScheduledRow[];

  for (const row of due) {
    db().prepare('DELETE FROM scheduled_messages WHERE id = ?').run(row.id);

    try {
      const channel = await client.channels.fetch(row.channel_id);
      if (channel?.isSendable()) {
        await channel.send({
          content: row.content,
          allowedMentions: { parse: ['users', 'roles'] },
        });
      }
    } catch (err) {
      logger.error(
        { err, channel: row.channel_id },
        'scheduled message failed',
      );
    }
  }
}
