import type { GuildMember, GuildTextBasedChannel } from 'discord.js';

import { getLevelResponder } from './autoresponder/store.js';
import { parse } from './autoresponder/parser.js';
import { evaluate } from './autoresponder/evaluate.js';
import { deliver } from './autoresponder/deliver.js';
import { logger } from './logger.js';

export function countLevelResponders(
  guildId: string,
  fromLevel: number,
  toLevel: number,
): number {
  let count = 0;
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    if (getLevelResponder(guildId, level)) count += 1;
  }
  return count;
}

export async function fireLevelUps(
  member: GuildMember,
  channel: GuildTextBasedChannel,
  fromLevel: number,
  toLevel: number,
): Promise<void> {
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    const responder = getLevelResponder(member.guild.id, level);
    if (!responder) continue;

    try {
      const result = await evaluate(
        parse(responder.response),
        { member, guild: member.guild, channel },
        responder.triggerKey,
      );
      if (!result.ok) continue;

      await deliver(result.segments, result.actions, { member, channel });
    } catch (err) {
      logger.error(
        { err, guild: member.guild.id, level },
        'level up reply failed',
      );
    }
  }
}
