import { SlashCommandBuilder, type Guild } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getInventory } from '../services/items/store.js';
import { paginate, applyPage } from '../utils/pagination.js';
import { registerPage } from '../services/pageRegistry.js';
import { commandMention } from '../utils/commandMentions.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

export function inventoryPage(guild: Guild, targetId: string, page: number) {
  const member = guild.members.cache.get(targetId);
  const entries = getInventory(guild.id, targetId);

  const embed = userEmbed(member?.user ?? guild.client.user)
    .setAuthor({
      name: `${member?.displayName ?? 'their'}'s inventory`,
      iconURL: member?.displayAvatarURL(),
    })
    .setColor(0xa8c8e8);

  if (entries.length === 0) {
    embed.setDescription(
      [
        'nothing in here yet...',
        '',
        `<:arrowright:1545483910022959194> see what's for sale with ${commandMention('/shop list')}`,
      ].join('\n'),
    );

    return { embeds: [embed], components: [] };
  }

  const hint = `<:arrowright:1545483910022959194> use one with ${commandMention('/items use')}`;

  const blocks = entries.map(({ item, quantity }) => {
    const summary = [
      `×${quantity.toLocaleString('en-US')}`,
      item.useReply ? 'usable' : null,
      item.giftable ? 'giftable' : null,
    ].filter((part) => part !== null);

    const lines = [`### ***${item.emoji ?? '📦'} ${item.name}***`];
    if (item.description) lines.push(item.description);
    lines.push(summary.join(' · '));
    return lines.join('\n');
  });

  const current = paginate(blocks, null, hint, page, '\n');
  const components = applyPage(embed, `inv:${targetId}`, current);

  return { embeds: [embed], components };
}

registerPage('inv', inventoryPage);

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
    await interaction.reply(inventoryPage(interaction.guild, target.id, 0));
  },
};
