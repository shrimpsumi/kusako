import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, setCurrency } from '../economy.js';
import { serverEmbed } from '../style.js';

export const settings: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('configure sako for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('see the current server settings'),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('currency')
        .setDescription('economy + currency settings')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('change the server currency')
            .addStringOption((o) =>
              o
                .setName('name')
                .setDescription('what the currency is called, e.g. curds')
                .setMaxLength(32)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('emoji')
                .setDescription('the emoji shown next to it')
                .setMaxLength(64)
                .setRequired(true),
            ),
        ),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'settings only exist inside a server !!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === null && sub === 'view') {
      const currency = getCurrency(guildId);

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ sako settings !')
        .addFields({
          name: 'currency',
          value: `${currency.emoji} ${currency.name}`,
          inline: true,
        });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'currency' && sub === 'set') {
      const name = interaction.options.getString('name', true);
      const emoji = interaction.options.getString('emoji', true);
      setCurrency(guildId, { name, emoji });

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ currency updated !')
        .setDescription(`this server's currency is now ${emoji} **${name}** !`);

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
