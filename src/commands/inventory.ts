import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getInventory } from '../items.js';
import { userEmbed, NO_DMS } from '../style.js';

export const inventory: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription("see what you're carrying !")
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription("peek at someone else's inventory")
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const entries = getInventory(interaction.guildId, target.id);

    const embed = userEmbed(target)
      .setTitle('✧･ﾟ inventory !')
      .setDescription(
        entries.length
          ? entries
              .map(
                (e) =>
                  `${e.item.emoji ?? '📦'} **${e.item.name}** × ${e.quantity.toLocaleString('en-US')}`,
              )
              .join('\n')
          : 'nothing in here yet... just some lint and a lonely button',
      );

    await interaction.reply({ embeds: [embed] });
  },
};
