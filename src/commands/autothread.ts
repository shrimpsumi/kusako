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
import { autoThreadTemplateIssues } from '../dsl/validate.js';
import {
  createAutoThread,
  getAutoThread,
  listAutoThreads,
  removeAutoThread,
  updateAutoThread,
  MAX_AUTO_THREADS_PER_GUILD,
  type AutoThread,
  type AutoThreadEdit,
} from '../services/autoThreads/store.js';
import { templateDetailEmbed } from '../utils/templateEmbed.js';
import { commandMention } from '../utils/commandMentions.js';
import {
  formatSeconds,
  previewText,
  channelChoiceLabel,
} from '../utils/format.js';
import { serverEmbed, failureEmbed, NO_DMS } from '../utils/style.js';

const REPLY_MAX = 2000;
const MAX_SLOWMODE = 21_600;

function replyPreview(response: string): string {
  return response.trim().length > 0 ? previewText(response) : 'thread only';
}

function describe(autoThread: AutoThread): string {
  const parts = [
    autoThread.slowmodeSeconds > 0
      ? `${formatSeconds(autoThread.slowmodeSeconds)} slowmode`
      : 'no slowmode',
  ];
  if (autoThread.closeButton) {
    parts.push(
      autoThread.lock ? 'close button, locks on close' : 'close button',
    );
  }
  return parts.join(' · ');
}

function missingPerms(guild: Guild, autoThread: AutoThread): string[] {
  const channel = guild.channels.cache.get(autoThread.channelId);
  const me = guild.members.me;
  if (!channel || !me) return [];

  const perms = channel.permissionsFor(me);
  const sends = autoThread.response.trim().length > 0 || autoThread.closeButton;
  const needed: Array<[bigint, string, boolean]> = [
    [PermissionFlagsBits.CreatePublicThreads, 'create public threads', true],
    [
      PermissionFlagsBits.SendMessagesInThreads,
      'send messages in threads',
      sends,
    ],
    [
      PermissionFlagsBits.ManageThreads,
      'manage threads',
      autoThread.closeButton && autoThread.lock,
    ],
  ];

  return needed
    .filter(([flag, , wanted]) => wanted && !perms.has(flag))
    .map(([, name]) => name);
}

function detailEmbed(guild: Guild, autoThread: AutoThread) {
  const notes: string[] = [];
  if (autoThread.response.trim().length === 0) {
    notes.push('no reply, sako just opens the thread');
  }
  if (autoThread.lock && !autoThread.closeButton) {
    notes.push('lock only does something with the close button on');
  }
  const missing = missingPerms(guild, autoThread);
  if (missing.length > 0) {
    notes.push(
      `heads up: i'm missing ${missing.join(', ')} in ${channelMention(autoThread.channelId)} !`,
    );
  }

  return templateDetailEmbed(guild, 'auto-thread', autoThread.response, {
    notes,
    fields: [
      { name: 'thread', value: describe(autoThread), inline: false },
      {
        name: 'in',
        value: channelMention(autoThread.channelId),
        inline: false,
      },
    ],
  });
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

  const issues = autoThreadTemplateIssues(reply);
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
  const reply = interaction.options.getString('reply');
  if (reply !== null && !(await checkReply(interaction, reply))) return;

  const created = createAutoThread({
    guildId: interaction.guildId,
    channelId: channel.id,
    response: reply ?? undefined,
    slowmodeSeconds: interaction.options.getInteger('slowmode') ?? undefined,
    closeButton: interaction.options.getBoolean('close_button') ?? undefined,
    lock: interaction.options.getBoolean('lock') ?? undefined,
  });

  if (!created.ok) {
    const why =
      created.reason === 'exists'
        ? `${channelMention(channel.id)} already has an auto-thread,, change it with ${commandMention('/autothread edit')}`
        : `this server already has ${MAX_AUTO_THREADS_PER_GUILD} auto-threads. remove one with ${commandMention('/autothread remove')} first`;
    await interaction.reply({ embeds: [failureEmbed(why)] });
    return;
  }

  await interaction.reply({
    embeds: [detailEmbed(interaction.guild, created.autoThread)],
  });
}

async function handleEdit(
  interaction: ChatInputCommandInteraction<'cached'>,
  found: AutoThread,
): Promise<void> {
  const reply = interaction.options.getString('reply');
  const clearReply = interaction.options.getBoolean('clear_reply') ?? false;
  const slowmode = interaction.options.getInteger('slowmode');
  const closeButton = interaction.options.getBoolean('close_button');
  const lock = interaction.options.getBoolean('lock');

  if (
    reply === null &&
    !clearReply &&
    slowmode === null &&
    closeButton === null &&
    lock === null
  ) {
    await interaction.reply({
      embeds: [
        failureEmbed(
          'give me something to change (reply, slowmode, close_button, or lock) !!',
        ),
      ],
    });
    return;
  }

  if (reply !== null && clearReply) {
    await interaction.reply({
      embeds: [failureEmbed('pick either reply or clear_reply, not both !')],
    });
    return;
  }

  const edit: AutoThreadEdit = {};
  if (reply !== null) {
    if (!(await checkReply(interaction, reply))) return;
    edit.response = reply;
  }
  if (clearReply) edit.response = '';
  if (slowmode !== null) edit.slowmodeSeconds = slowmode;
  if (closeButton !== null) edit.closeButton = closeButton;
  if (lock !== null) edit.lock = lock;

  const updated = updateAutoThread(interaction.guildId, found.channelId, edit);
  if (!updated) {
    await interaction.reply({
      embeds: [
        failureEmbed('that auto-thread went missing while i was editing !'),
      ],
    });
    return;
  }

  await interaction.reply({
    embeds: [detailEmbed(interaction.guild, updated)],
  });
}

async function handleRemove(
  interaction: ChatInputCommandInteraction<'cached'>,
  found: AutoThread,
): Promise<void> {
  const removed =
    removeAutoThread(interaction.guildId, found.channelId) ?? found;

  const lines = [
    `## removed the auto-thread in ${channelMention(removed.channelId)} !`,
  ];
  if (removed.response.trim().length > 0) {
    lines.push(`\`\`\`\n${removed.response.slice(0, 1800)}\n\`\`\``);
  }
  lines.push(
    `-# threads it already opened stay put. put it back with ${commandMention('/autothread add')}`,
  );

  await interaction.reply({
    embeds: [serverEmbed(interaction.guild).setDescription(lines.join('\n'))],
  });
}

function autoThreadChannelOption(description: string) {
  return (o: SlashCommandStringOption) =>
    o
      .setName('channel')
      .setDescription(description)
      .setAutocomplete(true)
      .setRequired(true);
}

export const autothread: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('autothread')
    .setDescription('open a thread on every post in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('make a new auto-thread')
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('where posts get threads')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('what sako says in each new thread (optional)'),
        )
        .addIntegerOption((o) =>
          o
            .setName('slowmode')
            .setDescription('slowmode in each thread, in seconds (default 0)')
            .setMinValue(0)
            .setMaxValue(MAX_SLOWMODE),
        )
        .addBooleanOption((o) =>
          o
            .setName('close_button')
            .setDescription('put a close button on the thread (default off)'),
        )
        .addBooleanOption((o) =>
          o
            .setName('lock')
            .setDescription('lock threads when they get closed (default off)'),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('every auto-thread in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('look at one auto-thread')
        .addStringOption(autoThreadChannelOption('which auto-thread')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('change an auto-thread')
        .addStringOption(autoThreadChannelOption('which auto-thread'))
        .addStringOption((o) =>
          o.setName('reply').setDescription('new reply for each thread'),
        )
        .addBooleanOption((o) =>
          o
            .setName('clear_reply')
            .setDescription('remove the reply so sako just opens the thread'),
        )
        .addIntegerOption((o) =>
          o
            .setName('slowmode')
            .setDescription('slowmode in each thread, in seconds')
            .setMinValue(0)
            .setMaxValue(MAX_SLOWMODE),
        )
        .addBooleanOption((o) =>
          o
            .setName('close_button')
            .setDescription('put a close button on the thread'),
        )
        .addBooleanOption((o) =>
          o.setName('lock').setDescription('lock threads when they get closed'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('stop threading a channel')
        .addStringOption(autoThreadChannelOption('which auto-thread')),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;

    const focused = interaction.options.getFocused().trim().toLowerCase();
    const choices = listAutoThreads(interaction.guildId)
      .map((row) => ({
        name: channelChoiceLabel(
          interaction.guild,
          row.channelId,
          replyPreview(row.response),
        ),
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
      const rows = listAutoThreads(guildId);
      const embed = serverEmbed(interaction.guild)
        .setTitle('auto-threads !')
        .setColor(0xc9e4de);

      if (rows.length === 0) {
        embed.setDescription(
          `no auto-threads yet,, make one with ${commandMention('/autothread add')}`,
        );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      const blocks = rows.map(
        (row) =>
          `### ${channelMention(row.channelId)}\n${describe(row)} · ${replyPreview(row.response)}`,
      );
      const hint = `<:arrowright:1545483910022959194> ${commandMention('/autothread show')} to read one !`;

      embed.setDescription([blocks.join('\n'), '', hint].join('\n'));
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const channelId = interaction.options.getString('channel', true);
    const found = getAutoThread(guildId, channelId);

    if (!found) {
      await interaction.reply({
        embeds: [
          failureEmbed(
            `there's no auto-thread in ${channelMention(channelId)},, check ${commandMention('/autothread list')}`,
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
