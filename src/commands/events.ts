import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  channelMention,
  codeBlock,
  inlineCode,
  type SlashCommandStringOption,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  setEventResponder,
  getEventResponder,
  removeEventResponder,
  EVENT_KINDS,
  type EventKind,
} from '../autoresponder/store.js';
import { getGuildSetting, setGuildSetting } from '../settings.js';
import { templateIssues } from '../autoresponder/validate.js';
import { parse } from '../autoresponder/parser.js';
import { fireEvent, eventChannelKey } from '../events/guildEvents.js';

const RESPONSE_MAX = 2000;

function eventOption(o: SlashCommandStringOption): SlashCommandStringOption {
  return o
    .setName('event')
    .setDescription('which event')
    .setRequired(true)
    .addChoices(
      { name: 'join', value: 'join' },
      { name: 'leave', value: 'leave' },
      { name: 'boost', value: 'boost' },
    );
}

export const events: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription(
      'messages sako sends when things happen (join, leave, boost)',
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('set the message for an event (replaces the old one)')
        .addStringOption(eventOption)
        .addStringOption((o) =>
          o
            .setName('response')
            .setDescription('what sako sends. variables work here !')
            .setMaxLength(RESPONSE_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('where messages for an event go')
        .addStringOption(eventOption)
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('the channel to send to')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription("show an event's raw message")
        .addStringOption(eventOption),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("remove an event's message")
        .addStringOption(eventOption),
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('all three events at a glance'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('fire an event as if you triggered it !')
        .addStringOption(eventOption),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'events only work inside a server !!',
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const kind =
      sub === 'view'
        ? null
        : (interaction.options.getString('event', true) as EventKind);

    if (sub === 'set' && kind) {
      const response = interaction.options.getString('response', true);

      const issues = templateIssues(response);
      if (issues) {
        await interaction.reply({ content: issues });
        return;
      }

      setEventResponder(guildId, kind, response);

      const notes: string[] = [];
      if (!getGuildSetting(guildId, eventChannelKey(kind))) {
        notes.push(
          `no channel set for ${kind} yet ! it won't fire until you run ${inlineCode('/events channel')}`,
        );
      }
      if (
        parse(response).some(
          (node) =>
            node.kind === 'placeholder' && node.name === 'deletetrigger',
        )
      ) {
        notes.push(
          'psst: {deletetrigger} does nothing on events, there is no message to delete',
        );
      }

      await interaction.reply({
        content: [`✦ set the ${kind} message :3`, ...notes].join('\n'),
      });
      return;
    }

    if (sub === 'channel' && kind) {
      const channel = interaction.options.getChannel('channel', true);
      setGuildSetting(guildId, eventChannelKey(kind), channel.id);

      await interaction.reply({
        content: `✦ ${kind} messages will go to ${channel.toString()} !`,
      });
      return;
    }

    if (sub === 'show' && kind) {
      const responder = getEventResponder(guildId, kind);

      await interaction.reply({
        content: responder
          ? `the **${kind}** message is:\n${codeBlock(responder.response)}`
          : `no ${kind} message set yet. make one with ${inlineCode('/events set')} !`,
      });
      return;
    }

    if (sub === 'remove' && kind) {
      const removed = removeEventResponder(guildId, kind);

      await interaction.reply({
        content: removed
          ? `removed the ${kind} message.`
          : `no ${kind} message to remove.`,
      });
      return;
    }

    if (sub === 'view') {
      const lines = EVENT_KINDS.map((eventKind) => {
        const responder = getEventResponder(guildId, eventKind);
        const channelId = getGuildSetting(guildId, eventChannelKey(eventKind));

        const message = responder ? 'message set' : 'no message';
        const channel = channelId
          ? `posts to ${channelMention(channelId)}`
          : 'no channel';
        return `• **${eventKind}**: ${message}, ${channel}`;
      });

      await interaction.reply({
        content: `✦ event messages\n${lines.join('\n')}`,
      });
      return;
    }

    if (sub === 'test' && kind) {
      const outcome = await fireEvent(
        interaction.guild,
        interaction.member,
        kind,
      );

      const channelId = getGuildSetting(guildId, eventChannelKey(kind));
      const replies: Record<typeof outcome, string> = {
        fired: `✧･ﾟ fired a test ${kind} ! check ${channelId ? channelMention(channelId) : 'the channel'} :3c`,
        'no-template': `no ${kind} message set yet. make one with ${inlineCode('/events set')} !`,
        'no-channel': `no channel for ${kind} yet ! set one with ${inlineCode('/events channel')}`,
        blocked: `a guard blocked it (a cooldown maybe?), nothing was sent`,
      };

      await interaction.reply({ content: replies[outcome] });
      return;
    }
  },
};
