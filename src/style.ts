import { EmbedBuilder, type Guild, type User } from 'discord.js';

export const colors = {
  cream: 0xfaf0e7,
} as const;

export function serverEmbed(guild: Guild): EmbedBuilder {
  return new EmbedBuilder().setColor(colors.cream).setAuthor({
    name: guild.name,
    iconURL: guild.iconURL({ size: 256 }) ?? undefined,
  });
}

export function userEmbed(user: User): EmbedBuilder {
  return new EmbedBuilder().setColor(colors.cream).setAuthor({
    name: user.username,
    iconURL: user.displayAvatarURL(),
  });
}
