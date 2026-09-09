import type { Client } from 'discord.js';

import { candidateDates, birthdayFireYear } from './dates.js';
import { dueBirthdays, stampFired, type Birthday } from './store.js';
import { getEventReply } from '../guildEvents/store.js';
import type { FireEvent } from '../guildEvents/registry.js';
import { getGuildTimezone, isValidTimeZone } from '../timezone.js';
import { logger } from '../../logger.js';

const SWEEP_MS = 60_000;
const SWEEP_BATCH = 20;

let sweeping: NodeJS.Timeout | null = null;

function groupByGuild(rows: Birthday[]): Map<string, Birthday[]> {
  const byGuild = new Map<string, Birthday[]>();

  for (const row of rows) {
    const existing = byGuild.get(row.guildId);
    if (existing) existing.push(row);
    else byGuild.set(row.guildId, [row]);
  }

  return byGuild;
}

export async function sweepBirthdays(
  client: Client,
  fire: FireEvent,
  now: number = Date.now(),
): Promise<number> {
  const due = dueBirthdays(candidateDates(now));
  if (due.length === 0) return 0;

  let fired = 0;

  for (const [guildId, rows] of groupByGuild(due)) {
    if (fired >= SWEEP_BATCH) break;

    const reply = getEventReply(guildId, 'birthday');
    if (!reply?.response || !reply.channelId) continue;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const guildZone = getGuildTimezone(guildId);

    for (const row of rows) {
      if (fired >= SWEEP_BATCH) break;

      const zone =
        row.timezone && isValidTimeZone(row.timezone)
          ? row.timezone
          : guildZone;

      const year = birthdayFireYear(row, now, zone);
      if (year === null) continue;

      const member = await guild.members.fetch(row.userId).catch(() => null);
      if (!member) continue;

      stampFired(guildId, row.userId, year);
      fired += 1;
      await fire(guild, member);
    }
  }

  return fired;
}

export function startBirthdaySweep(client: Client, fire: FireEvent): void {
  if (sweeping) return;

  sweeping = setInterval(() => {
    void sweepBirthdays(client, fire).catch((err: unknown) => {
      logger.error({ err }, 'birthday sweep failed');
    });
  }, SWEEP_MS);
}

export function stopBirthdaySweep(): void {
  if (!sweeping) return;
  clearInterval(sweeping);
  sweeping = null;
}
