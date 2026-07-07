import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  codeBlock,
  inlineCode,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  addAutoresponder,
  editAutoresponder,
  removeAutoresponder,
  getAutoresponder,
  listAutoresponders,
  setMatchMode,
  type MatchMode,
} from '../autoresponder/store.js';
import { parse } from '../autoresponder/parser.js';
import { validateTemplate } from '../autoresponder/validate.js';

const TRIGGER_MAX = 100;
const RESPONSE_MAX = 2000;

function templateIssues(response: string): string | null {
  const errors = validateTemplate(parse(response));
  if (errors.length === 0) return null;

  return `hmm, that reply has some problems !!\n${errors.map((e) => `• ${e}`).join('\n')}`;
}

export const autoresponders: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('autoresponders')
    .setDescription("manage this server's autoresponders")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('create a new autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('triggers the autoresponse')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('response')
            .setDescription('what sako replies with !')
            .setMaxLength(RESPONSE_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('change an existing autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger to edit')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('response')
            .setDescription('the new response')
            .setMaxLength(RESPONSE_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('matchmode')
        .setDescription('change how a trigger matches messages')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger to change')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('mode')
            .setDescription('how the trigger should match')
            .setRequired(true)
            .addChoices(
              { name: 'exact (message equals the trigger)', value: 'exact' },
              {
                name: 'starts with (whole word at the start)',
                value: 'startswith',
              },
              {
                name: 'ends with (whole word at the end)',
                value: 'endswith',
              },
              {
                name: 'includes (anywhere in the message)',
                value: 'includes',
              },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('delete an autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger for autoresponder to delete')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('list every autoresponder in this server'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('show a specific autoresponder')
        .addStringOption((o) =>
          o
            .setName('trigger')
            .setDescription('the trigger to show')
            .setMaxLength(TRIGGER_MAX)
            .setRequired(true),
        ),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'autoresponders only work inside a server !!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const trigger = interaction.options.getString('trigger', true);
      const response = interaction.options.getString('response', true);

      const issues = templateIssues(response);
      if (issues) {
        await interaction.reply({
          content: issues,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const created = addAutoresponder(guildId, trigger, response);

      await interaction.reply({
        content: created
          ? `added an autoresponder for ${inlineCode(trigger)} c:`
          : `a responder for ${inlineCode(trigger)} already exists. use ${inlineCode('/autoresponders edit')} to change it.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'edit') {
      const trigger = interaction.options.getString('trigger', true);
      const response = interaction.options.getString('response', true);

      const issues = templateIssues(response);
      if (issues) {
        await interaction.reply({
          content: issues,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const edited = editAutoresponder(guildId, trigger, response);

      await interaction.reply({
        content: edited
          ? `updated the autoresponder for ${inlineCode(trigger)} c:`
          : `no autoresponder for ${inlineCode(trigger)} exists yet. use ${inlineCode('/autoresponders add')} to make one.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'matchmode') {
      const trigger = interaction.options.getString('trigger', true);
      const mode = interaction.options.getString('mode', true) as MatchMode;

      const changed = setMatchMode(guildId, trigger, mode);

      await interaction.reply({
        content: changed
          ? `${inlineCode(trigger)} now matches as ${inlineCode(mode)} c:`
          : `no autoresponder for ${inlineCode(trigger)} exists yet. use ${inlineCode('/autoresponders add')} to make one.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger', true);
      const removed = removeAutoresponder(guildId, trigger);

      await interaction.reply({
        content: removed
          ? `removed the autoresponder for ${inlineCode(trigger)}.`
          : `no autoresponder for ${inlineCode(trigger)} to remove.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'list') {
      const all = listAutoresponders(guildId);

      await interaction.reply({
        content: all.length
          ? `**autoresponders (${all.length}):**\n${all.map((a) => `• ${inlineCode(a.trigger)}${a.matchMode === 'exact' ? '' : ` (${a.matchMode})`}`).join('\n')}`
          : 'no autoresponders set up yet. add one with /autoresponders add!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'show') {
      const trigger = interaction.options.getString('trigger', true);
      const found = getAutoresponder(guildId, trigger);

      await interaction.reply({
        content: found
          ? `**${inlineCode(found.trigger)}** (${found.matchMode}) replies with:\n${codeBlock(found.response)}`
          : `no autoresponder for ${inlineCode(trigger)} found.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};
