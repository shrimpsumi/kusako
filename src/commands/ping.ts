import { SlashCommandBuilder, MessageFlags } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { logger } from '../logger.js';

export const ping: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('am i online??'),
  async execute(interaction) {
    const sent = await interaction.reply({
      content: 'pongg',
      withResponse: true,
      flags: MessageFlags.Ephemeral,
    });
    logger.info(
      { user: interaction.user.id, guild: interaction.guildId },
      '/ping',
    );
  },
};
