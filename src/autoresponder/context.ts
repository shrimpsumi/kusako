import type { Guild, GuildMember, GuildTextBasedChannel } from 'discord.js';

export interface RenderContext {
  member: GuildMember;
  guild: Guild;
  channel: GuildTextBasedChannel;
}
