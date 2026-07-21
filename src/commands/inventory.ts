import { SlashCommandBuilder, inlineCode } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getInventory } from '../items.js';
import { EMBED_LIMITS } from '../embeds.js';
import { userEmbed, spacerFile, SPACER_IMAGE, NO_DMS } from '../style.js';

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
    const targetMember =
      target.id === interaction.user.id
        ? interaction.member
        : interaction.options.getMember('user');
    const nickname = targetMember?.displayName ?? target.displayName;

    const entries = getInventory(interaction.guildId, target.id);

    const embed = userEmbed(target)
      .setAuthor({
        name: `${nickname}'s inventory`,
        iconURL: target.displayAvatarURL(),
      })
      .setImage(SPACER_IMAGE)
      .setFooter({ text: 'global stash lives in /balance !' });

    if (entries.length === 0) {
      embed.setDescription(
        ['꒰ server ꒱', '-# here be... nothing!'].join('\n'),
      );

      await interaction.reply({ embeds: [embed], files: [spacerFile()] });
      return;
    }

    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const kinds = entries.length === 1 ? '1 kind' : `${entries.length} kinds`;
    const things =
      total === 1 ? '1 thing' : `${total.toLocaleString('en-US')} things`;
    const header = `꒰ server ꒱ *${kinds} ⊹ ${things} total*`;
    const hint = `⁀જ➣ use one with ${inlineCode('/items use <item>')}`;

    const blocks: string[] = [];
    let hidden = 0;
    for (const { item, quantity } of entries) {
      const traits = [
        item.useReply ? 'usable' : null,
        item.giftable ? 'giftable' : null,
      ].filter((trait) => trait !== null);

      const lines = [
        `${item.emoji ?? '📦'} **${item.name}** ×${quantity.toLocaleString('en-US')}`,
      ];
      if (item.description) lines.push(`-# ✧ ${item.description}`);
      if (traits.length) lines.push(`-# ✧ ${traits.join(' ━ ')}`);
      const block = lines.join('\n');

      const projected = [header, ...blocks, block, hint].join('\n\n');
      if (projected.length > EMBED_LIMITS.description) {
        hidden = entries.length - blocks.length;
        break;
      }
      blocks.push(block);
    }

    embed.setDescription([header, ...blocks, hint].join('\n\n'));
    if (hidden) {
      embed.setFooter({
        text: `${hidden} more didn't fit ━━━ global stash lives in /balance !`,
      });
    }

    await interaction.reply({ embeds: [embed], files: [spacerFile()] });
  },
};
