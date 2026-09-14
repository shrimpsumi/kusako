import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency } from '../services/economy/guild.js';
import { STAT_GAMES, getGameStats, pushesOf } from '../services/games/stats.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const n = (value: number) => value.toLocaleString('en-US');

export const stats: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('check your game stats !')
    .addStringOption((o) =>
      o
        .setName('game')
        .setDescription('which game')
        .setRequired(true)
        .addChoices(...STAT_GAMES.map((g) => ({ name: g.id, value: g.id }))),
    )
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription("peek at someone else's stats")
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const gameId = interaction.options.getString('game', true);
    const entry = STAT_GAMES.find((g) => g.id === gameId);

    if (!entry) {
      await interaction.reply({ content: "i don't know that game !" });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const isSelf = target.id === interaction.user.id;
    const targetMember = isSelf
      ? interaction.member
      : interaction.options.getMember('user');
    const nickname = targetMember?.displayName ?? target.displayName;

    const embed = userEmbed(target)
      .setTitle(`${entry.id} stats !`)
      .setColor(0xffd59e);

    const record = getGameStats(interaction.guildId, target.id, entry.id);

    if (!record) {
      const who = isSelf ? "you haven't" : `${nickname} hasn't`;
      embed.setDescription(`${who} played any ${entry.id} yet!`);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const currency = getCurrency(interaction.guildId);

    const counts = [
      `wins **${n(record.wins)}**`,
      `losses **${n(record.losses)}**`,
    ];
    if (entry.pushes) counts.push(`pushes **${n(pushesOf(record))}**`);

    const sign = record.net > 0 ? '+' : record.net < 0 ? '-' : '';
    const money = [
      `net ${sign}${currency.emoji} **${n(Math.abs(record.net))}**`,
    ];
    if (record.bestWin > 0) {
      money.push(`best win ${currency.emoji} **${n(record.bestWin)}**`);
    }

    embed.setDescription(
      [
        '### ***record***',
        counts.join(' · '),
        `-# games played: ${n(record.played)}`,
        '### ***streaks***',
        `current **${n(record.streak)}** · best **${n(record.bestStreak)}**`,
        `### ***earnings***`,
        money.join(' · '),
      ].join('\n'),
    );

    await interaction.reply({ embeds: [embed] });
  },
};
