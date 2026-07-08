import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  inlineCode,
  type AutocompleteInteraction,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  createItem,
  editItem,
  deleteItem,
  getItem,
  listItems,
  getCirculation,
} from '../items.js';
import { serverEmbed } from '../style.js';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;
const EMOJI_MAX = 64;

export async function respondWithItemNames(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const choices = listItems(interaction.guildId)
    .filter((item) => item.nameKey.includes(focused))
    .slice(0, 25)
    .map((item) => ({ name: item.name, value: item.name }));

  await interaction.respond(choices);
}

export const items: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('items')
    .setDescription("manage this server's items")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('create a new item')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item name (also its id, case insensitive)')
            .setMaxLength(NAME_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('description')
            .setDescription('what is this thing?')
            .setMaxLength(DESCRIPTION_MAX)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('emoji')
            .setDescription('the emoji shown next to it')
            .setMaxLength(EMOJI_MAX)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription("change an item's description or emoji")
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to edit')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName('description')
            .setDescription('the new description')
            .setMaxLength(DESCRIPTION_MAX)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('emoji')
            .setDescription('the new emoji')
            .setMaxLength(EMOJI_MAX)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('delete an item (removes it from every inventory !)')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to delete')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('list every item in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('show details about an item')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to look at')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ) as SlashCommandBuilder,

  autocomplete: respondWithItemNames,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'items only exist inside a server !!',
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description');
      const emoji = interaction.options.getString('emoji');
      const created = createItem(guildId, name, description, emoji);

      if (!created) {
        await interaction.reply({
          content: `an item called ${inlineCode(name)} already exists (or the name is empty). use ${inlineCode('/items edit')} to change it !`,
        });
        return;
      }

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ item created !')
        .setDescription(
          `${emoji ?? '📦'} **${name.trim()}**${description ? `\n${description}` : ''}`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'edit') {
      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description');
      const emoji = interaction.options.getString('emoji');

      if (description === null && emoji === null) {
        await interaction.reply({
          content:
            'give me something to change !! a description or an emoji c:',
        });
        return;
      }

      const edited = editItem(guildId, name, {
        description: description ?? undefined,
        emoji: emoji ?? undefined,
      });

      if (!edited) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      const updated = getItem(guildId, name)!;
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ item updated !')
        .setDescription(
          `${updated.emoji ?? '📦'} **${updated.name}**${updated.description ? `\n${updated.description}` : ''}`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name', true);
      const deleted = deleteItem(guildId, name);

      if (!deleted) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ item deleted !')
        .setDescription(
          `deleted ${inlineCode(name)} and removed it from everyone's inventories.`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'list') {
      const all = listItems(guildId);

      const embed = serverEmbed(interaction.guild)
        .setTitle(`✦ server items (${all.length}) !`)
        .setDescription(
          all.length
            ? all.map((i) => `${i.emoji ?? '📦'} **${i.name}**`).join('\n')
            : `no items yet. make one with ${inlineCode('/items create')} c:`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'info') {
      const name = interaction.options.getString('name', true);
      const item = getItem(guildId, name);

      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      const embed = serverEmbed(interaction.guild)
        .setTitle(`✦ ${item.emoji ?? '📦'} ${item.name}`)
        .setDescription(item.description ?? 'no description... very mysterious')
        .addFields({
          name: 'in circulation',
          value: getCirculation(guildId, name).toLocaleString('en-US'),
          inline: true,
        });

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
