import type { Guild, GuildMember, GuildTextBasedChannel } from 'discord.js';

export interface RenderContext {
  member: GuildMember;
  guild: Guild;
  channel: GuildTextBasedChannel;
  messageArgs?: string[];
}

export interface EvalMeta {
  guildId: string;
  userId: string;
  triggerKey: string;
}
