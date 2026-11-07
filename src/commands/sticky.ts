import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  channelMention,
  type Guild,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import { stickyTemplateIssues } from '../dsl/validate.js';
import {
  createSticky,
  getSticky,
  listStickies,
  removeSticky,
  updateSticky,
  DEFAULT_EVERY_MESSAGES,
  DEFAULT_MIN_SECONDS,
  MAX_STICKIES_PER_GUILD,
  type Sticky,
  type StickyEdit,
} from '../services/stickies/store.js';
import { postSticky } from '../services/stickies/fire.js';
import { templateDetailEmbed } from '../utils/templateEmbed.js';
import { commandMention } from '../utils/commandMentions.js';
import { formatSeconds } from '../utils/format.js';
import { serverEmbed, failureEmbed, NO_DMS } from '../utils/style.js';

const REPLY_MAX = 2000;
const MAX_EVERY = 100;
const MAX_WAIT = 86_400;

function describe(sticky: Sticky): string {
  const count = Math.max(1, sticky.everyMessages);
  const messages = count === 1 ? 'every message' : `every ${count} messages`;

  return sticky.minSeconds > 0
    ? `after ${messages}, at least ${formatSeconds(sticky.minSeconds)} apart`
    : `after ${messages}`;
}

function preview(response: string): string {
  const flat = response.replace(/\s+/g, ' ').trim();
  return flat.length > 44 ? `${flat.slice(0, 43)}…` : flat;
}

function choiceLabel(guild: Guild, sticky: Sticky): string {
  const name = guild.channels.cache.get(sticky.channelId)?.name;
  const where = name ? `#${name}` : 'deleted channel';
  const text = `${where} · ${preview(sticky.response)}`;
  return text.length > 100 ? `${text.slice(0, 99)}…` : text;
}

function detailEmbed(guild: Guild, sticky: Sticky) {
  return templateDetailEmbed(guild, 'sticky', sticky.response, {
    cooldown: false,
    fields: [
      { name: 'reposts', value: describe(sticky), inline: false },
      { name: 'in', value: channelMention(sticky.channelId), inline: false },
    ],
  });
}

function postFailed(channelId: string) {
  return failureEmbed(
    `i couldn't post the sticky in ${channelMention(channelId)} just now,, make sure i can send messages there and that the reply has something to show`,
  );
}

async function checkReply(
  interaction: ChatInputCommandInteraction<'cached'>,
  reply: string,
): Promise<boolean> {
  if (reply.length > REPLY_MAX) {
    await interaction.reply({
      embeds: [failureEmbed(`replies cap at ${REPLY_MAX} characters !`)],
    });
    return false;
  }

  const issues = stickyTemplateIssues(reply);
  if (issues) {
    await interaction.reply({ embeds: [failureEmbed(issues)] });
    return false;
  }
  return true;
}

async function handleAdd(
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true, [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
  ]);
  const reply = interaction.options.getString('reply', true);
  if (!(await checkReply(interaction, reply))) return;

  const created = createSticky({
    guildId: interaction.guildId,
    channelId: channel.id,
    response: reply,
    everyMessages: interaction.options.getInteger('every') ?? undefined,
    minSeconds: interaction.options.getInteger('wait') ?? undefined,
  });

  if (!created.ok) {
    const why =
      created.reason === 'exists'
        ? `${channelMention(channel.id)} already has a sticky,, change it with ${commandMention('/sticky edit')}`
        : `this server already has ${MAX_STICKIES_PER_GUILD} stickies. remove one with ${commandMention('/sticky remove')} first`;
    await interaction.reply({ embeds: [failureEmbed(why)] });
    return;
  }

  await interaction.reply({
    embeds: [detailEmbed(interaction.guild, created.sticky)],
  });
  if (!(await postSticky(channel))) {
    await interaction.followUp({ embeds: [postFailed(channel.id)] });
  }
}

async function handleEdit(
  interaction: ChatInputCommandInteraction<'cached'>,
  found: Sticky,
): Promise<void> {
  const reply = interaction.options.getString('reply');
  const every = interaction.options.getInteger('every');
  const wait = interaction.options.getInteger('wait');

  if (reply === null && every === null && wait === null) {
    await interaction.reply({
      embeds: [
        failureEmbed('give me something to change (reply, every, or wait) !!'),
      ],
    });
    return;
  }

  const channel = interaction.guild.channels.cache.get(found.channelId);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      embeds: [
        failureEmbed(
          `that channel is gone,, clear the sticky out with ${commandMention('/sticky remove')}`,
        ),
      ],
    });
    return;
  }

  const edit: StickyEdit = {};
  if (reply !== null) {
    if (!(await checkReply(interaction, reply))) return;
    edit.response = reply;
  }
  if (every !== null) edit.everyMessages = every;
  if (wait !== null) edit.minSeconds = wait;

  const updated = updateSticky(interaction.guildId, found.channelId, edit);
  if (!updated) {
    await interaction.reply({
      embeds: [failureEmbed('that sticky went missing while i was editing !')],
    });
    return;
  }

  await interaction.reply({
    embeds: [detailEmbed(interaction.guild, updated)],
  });
  if (!(await postSticky(channel))) {
    await interaction.followUp({ embeds: [postFailed(channel.id)] });
  }
}

async function handleRemove(
  interaction: ChatInputCommandInteraction<'cached'>,
  found: Sticky,
): Promise<void> {
  const removed = removeSticky(interaction.guildId, found.channelId) ?? found;

  const channel = interaction.guild.channels.cache.get(removed.channelId);
  if (removed.lastMessageId && channel?.isTextBased()) {
    await channel.messages.delete(removed.lastMessageId).catch(() => null);
  }

  const eulogy = serverEmbed(interaction.guild).setDescription(
    [
      `## removed the sticky in ${channelMention(removed.channelId)} !`,
      `\`\`\`\n${removed.response.slice(0, 1800)}\n\`\`\``,
      `-# put it back with ${commandMention('/sticky add')}`,
    ].join('\n'),
  );

  await interaction.reply({ embeds: [eulogy] });
}

function stickyChannelOption(description: string) {
  return (o: SlashCommandStringOption) =>
    o
      .setName('channel')
      .setDescription(description)
      .setAutocomplete(true)
      .setRequired(true);
}

export const sticky: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('keep a message at the bottom of a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('make a new sticky')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('where it stays')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('what sako posts')
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('every')
            .setDescription(
              `how many messages before it reposts (default ${DEFAULT_EVERY_MESSAGES})`,
            )
            .setMinValue(0)
            .setMaxValue(MAX_EVERY),
        )
        .addIntegerOption((o) =>
          o
            .setName('wait')
            .setDescription(
              `fewest seconds between reposts (default ${DEFAULT_MIN_SECONDS})`,
            )
            .setMinValue(0)
            .setMaxValue(MAX_WAIT),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('every sticky in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('look at one sticky')
        .addStringOption(stickyChannelOption('which sticky')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('change a sticky')
        .addStringOption(stickyChannelOption('which sticky'))
        .addStringOption((o) =>
          o.setName('reply').setDescription('new text for the sticky'),
        )
        .addIntegerOption((o) =>
          o
            .setName('every')
            .setDescription('how many messages before it reposts')
            .setMinValue(0)
            .setMaxValue(MAX_EVERY),
        )
        .addIntegerOption((o) =>
          o
            .setName('wait')
            .setDescription('fewest seconds between reposts')
            .setMinValue(0)
            .setMaxValue(MAX_WAIT),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('take a sticky down')
        .addStringOption(stickyChannelOption('which sticky')),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;

    const focused = interaction.options.getFocused().trim().toLowerCase();
    const choices = listStickies(interaction.guildId)
      .map((row) => ({
        name: choiceLabel(interaction.guild, row),
        value: row.channelId,
      }))
      .filter(
        (choice) =>
          focused.length === 0 || choice.name.toLowerCase().includes(focused),
      )
      .slice(0, 25);

    await interaction.respond(choices);
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await handleAdd(interaction);
      return;
    }

    if (sub === 'list') {
      const rows = listStickies(guildId);
      const embed = serverEmbed(interaction.guild)
        .setTitle('stickies !')
        .setColor(0xf4c7a1);

      if (rows.length === 0) {
        embed.setDescription(
          `no stickies yet,, make one with ${commandMention('/sticky add')}`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      const blocks = rows.map(
        (row) =>
          `### ${channelMention(row.channelId)}\n${describe(row)} · ${preview(row.response)}`,
      );
      const hint = `<:arrowright:1545483910022959194> ${commandMention('/sticky show')} to read one !`;

      embed.setDescription([blocks.join('\n'), '', hint].join('\n'));
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const channelId = interaction.options.getString('channel', true);
    const found = getSticky(guildId, channelId);

    if (!found) {
      await interaction.reply({
        embeds: [
          failureEmbed(
            `there's no sticky in ${channelMention(channelId)},, check ${commandMention('/sticky list')}`,
          ),
        ],
      });
      return;
    }

    if (sub === 'show') {
      await interaction.reply({
        embeds: [detailEmbed(interaction.guild, found)],
      });
      return;
    }

    if (sub === 'edit') {
      await handleEdit(interaction, found);
      return;
    }

    await handleRemove(interaction, found);
  },
};
