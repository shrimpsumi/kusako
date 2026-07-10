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
  transferItem,
} from '../items.js';
import { serverEmbed, userEmbed } from '../style.js';
import { parse } from '../autoresponder/parser.js';
import type { Node } from '../autoresponder/ast.js';
import { templateIssues } from '../autoresponder/validate.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;
const EMOJI_MAX = 64;
const REPLY_MAX = 2000;

const ADMIN_SUBS = new Set(['create', 'edit', 'delete']);

function itemReplyIssues(reply: string): string | null {
  const hasCooldown = parse(reply).some(
    (node) => node.kind === 'placeholder' && node.name === 'cooldown',
  );
  if (hasCooldown) {
    return "{cooldown} doesn't work in item replies ! the item getting used up is already the limit c:";
  }
  return templateIssues(reply);
}

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
    .setDescription("this server's items ! browse, use, and gift them")
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('create a new item (needs manage server)')
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
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription(
              'what happens when someone uses it (same syntax as autoresponder replies)',
            )
            .setMaxLength(REPLY_MAX)
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o
            .setName('role')
            .setDescription(
              'role given on use (appends {giverole} to the reply)',
            )
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName('giftable')
            .setDescription('can this item be gifted? (default yes)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('change an item (needs manage server)')
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
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('the new use reply (blank to clear it)')
            .setMaxLength(REPLY_MAX)
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o
            .setName('role')
            .setDescription(
              'role given on use (appends {giverole} to the reply)',
            )
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName('giftable')
            .setDescription('can this item be gifted?')
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
    )
    .addSubcommand((sub) =>
      sub
        .setName('use')
        .setDescription('use an item from your inventory !')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to use')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('gift')
        .setDescription('gift an item to someone !')
        .addStringOption((o) =>
          o
            .setName('name')
            .setDescription('the item to gift')
            .setMaxLength(NAME_MAX)
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((o) =>
          o.setName('user').setDescription('who gets it').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('how many (default 1)')
            .setMinValue(1)
            .setRequired(false),
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

    if (
      ADMIN_SUBS.has(sub) &&
      !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: 'you need **manage server** to manage items !',
      });
      return;
    }

    if (sub === 'create') {
      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description');
      const emoji = interaction.options.getString('emoji');
      const reply = interaction.options.getString('reply');
      const role = interaction.options.getRole('role');
      const giftable = interaction.options.getBoolean('giftable') ?? true;

      let useReply = reply?.trim() || null;
      if (role) useReply = `${useReply ?? ''}{giverole:${role.id}}`;

      if (useReply) {
        const issues = itemReplyIssues(useReply);
        if (issues) {
          await interaction.reply({
            content: issues,
            allowedMentions: { parse: [] },
          });
          return;
        }
      }

      const created = createItem(
        guildId,
        name,
        description,
        emoji,
        useReply,
        giftable,
      );

      if (!created) {
        await interaction.reply({
          content: `an item called ${inlineCode(name)} already exists (or the name is empty). use ${inlineCode('/items edit')} to change it !`,
        });
        return;
      }

      const notes = [
        useReply ? 'usable !' : null,
        giftable ? null : 'not giftable',
      ].filter((n) => n !== null);
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ item created !')
        .setDescription(
          `${emoji ?? '📦'} **${name.trim()}**${description ? `\n${description}` : ''}${notes.length ? `\n-# ${notes.join(' · ')}` : ''}`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'edit') {
      const name = interaction.options.getString('name', true);
      const description = interaction.options.getString('description');
      const emoji = interaction.options.getString('emoji');
      const reply = interaction.options.getString('reply');
      const role = interaction.options.getRole('role');
      const giftable = interaction.options.getBoolean('giftable');

      if (
        description === null &&
        emoji === null &&
        reply === null &&
        role === null &&
        giftable === null
      ) {
        await interaction.reply({
          content: 'give me something to change !! c:',
        });
        return;
      }

      const existing = getItem(guildId, name);
      if (!existing) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      let useReply: string | null | undefined;
      if (reply !== null) useReply = reply.trim() || null;
      if (role) {
        const base = useReply === undefined ? existing.useReply : useReply;
        useReply = `${base ?? ''}{giverole:${role.id}}`;
      }

      if (typeof useReply === 'string') {
        const issues = itemReplyIssues(useReply);
        if (issues) {
          await interaction.reply({
            content: issues,
            allowedMentions: { parse: [] },
          });
          return;
        }
      }

      editItem(guildId, name, {
        description: description ?? undefined,
        emoji: emoji ?? undefined,
        useReply,
        giftable: giftable ?? undefined,
      });

      const updated = getItem(guildId, name)!;
      const notes = [
        updated.useReply ? 'usable !' : null,
        updated.giftable ? null : 'not giftable',
      ].filter((n) => n !== null);
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ item updated !')
        .setDescription(
          `${updated.emoji ?? '📦'} **${updated.name}**${updated.description ? `\n${updated.description}` : ''}${notes.length ? `\n-# ${notes.join(' · ')}` : ''}`,
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
        .addFields(
          {
            name: 'in circulation',
            value: getCirculation(guildId, name).toLocaleString('en-US'),
            inline: true,
          },
          {
            name: 'usable',
            value: item.useReply ? 'yes !' : 'no',
            inline: true,
          },
          {
            name: 'giftable',
            value: item.giftable ? 'yes !' : 'no',
            inline: true,
          },
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'use') {
      const name = interaction.options.getString('name', true);
      const item = getItem(guildId, name);

      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      if (!item.useReply) {
        await interaction.reply({
          content: `${item.emoji ?? '📦'} **${item.name}** can't be used ! it's just for holding c:`,
        });
        return;
      }

      const channel = interaction.channel;
      if (!channel) {
        await interaction.reply({ content: "i can't see this channel !" });
        return;
      }

      const nodes: Node[] = [
        {
          kind: 'placeholder',
          name: 'modifyinv',
          args: [item.name, '-1'],
          captureName: null,
          raw: `{modifyinv:${item.name}|-1}`,
        },
        ...parse(item.useReply),
      ];

      const result = await evaluate(
        nodes,
        {
          member: interaction.member,
          guild: interaction.guild,
          channel,
        },
        `item:${item.nameKey}`,
      );

      if (!result.ok) {
        await interaction.reply({
          content: result.message,
          allowedMentions: { parse: [] },
        });
        return;
      }

      const embed = userEmbed(interaction.user)
        .setTitle('✧･ﾟ item used !')
        .setDescription(`you use ${item.emoji ?? '📦'} **${item.name}** !`);
      await interaction.reply({ embeds: [embed] });

      await deliver(result.segments, result.actions, {
        member: interaction.member,
        channel,
      });
      return;
    }

    if (sub === 'gift') {
      const name = interaction.options.getString('name', true);
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount') ?? 1;

      if (target.bot) {
        await interaction.reply({
          content: "bots can't hold items ! they have no pockets :c",
        });
        return;
      }

      if (target.id === interaction.user.id) {
        await interaction.reply({
          content: "that's already yours, silly !!",
        });
        return;
      }

      const item = getItem(guildId, name);
      if (!item) {
        await interaction.reply({
          content: `there's no item called ${inlineCode(name)} !`,
        });
        return;
      }

      if (!item.giftable) {
        await interaction.reply({
          content: `${item.emoji ?? '📦'} **${item.name}** can't be gifted !`,
        });
        return;
      }

      const result = transferItem(
        guildId,
        interaction.user.id,
        target.id,
        name,
        amount,
      );

      if (!result.ok) {
        await interaction.reply({
          content: `you don't have ${amount}× ${item.emoji ?? '📦'} **${item.name}** to give ! you only have ${result.quantity} !`,
        });
        return;
      }

      const embed = userEmbed(interaction.user)
        .setTitle('✧･ﾟ gift sent !')
        .setDescription(
          `${interaction.user} gave ${amount}× ${item.emoji ?? '📦'} **${item.name}** to ${target} !`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
