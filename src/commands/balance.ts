import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getBalance, getCurrency } from '../economy.js';
import { userEmbed } from '../style.js';

export const balance: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('check your balance !')
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription("peek at someone else's balance")
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'balances only exist inside a server !!',
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const currency = getCurrency(interaction.guildId);
    const amount = getBalance(interaction.guildId, target.id);
    const pretty = `${currency.emoji} **${amount.toLocaleString('en-US')} ${currency.name}**`;

    const embed = userEmbed(target)
      .setTitle('✧･ﾟ balance !')
      .setDescription(
        target.id === interaction.user.id
          ? `you have ${pretty} !`
          : `${target.displayName} has ${pretty} !`,
      );

    await interaction.reply({ embeds: [embed] });
  },
};
