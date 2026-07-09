import { Events, type Guild, type GuildMember } from 'discord.js';

import type { SakoClient } from '../client.js';
import { getEventResponder, type EventKind } from '../autoresponder/store.js';
import { getGuildSetting } from '../settings.js';
import { parse } from '../autoresponder/parser.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';
import { logger } from '../logger.js';

export type FireOutcome = 'fired' | 'no-template' | 'no-channel' | 'blocked';

export function eventChannelKey(kind: EventKind): string {
  return `event.${kind}.channel`;
}

export async function fireEvent(
  guild: Guild,
  member: GuildMember,
  kind: EventKind,
): Promise<FireOutcome> {
  const responder = getEventResponder(guild.id, kind);
  if (!responder) return 'no-template';

  const channelId = getGuildSetting(guild.id, eventChannelKey(kind));
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel || !channel.isTextBased()) return 'no-channel';

  const result = await evaluate(
    parse(responder.response),
    { member, guild, channel },
    responder.triggerKey,
  );
  if (!result.ok) return 'blocked';

  await deliver(result.segments, result.actions, { member, channel });
  return 'fired';
}

export function registerGuildEvents(client: SakoClient): void {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await fireEvent(member.guild, member, 'join');
    } catch (err) {
      logger.error({ err, guild: member.guild.id }, 'join event failed');
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      await fireEvent(member.guild, member as GuildMember, 'leave');
    } catch (err) {
      logger.error({ err, guild: member.guild.id }, 'leave event failed');
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.premiumSince || !newMember.premiumSince) return;
    try {
      await fireEvent(newMember.guild, newMember, 'boost');
    } catch (err) {
      logger.error({ err, guild: newMember.guild.id }, 'boost event failed');
    }
  });
}
