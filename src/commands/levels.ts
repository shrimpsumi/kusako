import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  codeBlock,
  inlineCode,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  setLevelResponder,
  getLevelResponder,
  removeLevelResponder,
  listLevelResponders,
} from '../autoresponder/store.js';
import { templateIssues } from '../autoresponder/validate.js';
import { isLevelingEnabled, MAX_LEVEL } from '../levels.js';
import { serverEmbed, NO_DMS } from '../style.js';

const RESPONSE_MAX = 2000;

export const levels: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('personalized level up replies for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('set the reply for reaching a level')
        .addIntegerOption((o) =>
          o
            .setName('level')
            .setDescription('which level to celebrate')
            .setMinValue(2)
            .setMaxValue(MAX_LEVEL)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('reply')
            .setDescription('what sako sends. variables work here !')
            .setMaxLength(RESPONSE_MAX)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription("show a level's raw reply")
        .addIntegerOption((o) =>
          o
            .setName('level')
            .setDescription('which level')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription("remove a level's reply")
        .addIntegerOption((o) =>
          o
            .setName('level')
            .setDescription('which level')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('every level with a reply'),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.respond([]);
      return;
    }

    const query = interaction.options.getFocused();
    const entries = listLevelResponders(interaction.guildId)
      .filter((entry) => entry.level.toString().startsWith(query))
      .slice(0, 25)
      .map((entry) => ({
        name: `level ${entry.level}`,
        value: entry.level,
      }));

    await interaction.respond(entries);
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const level = interaction.options.getInteger('level', true);
      const reply = interaction.options.getString('reply', true);

      const issues = templateIssues(reply);
      if (issues) {
        await interaction.reply({ content: issues });
        return;
      }

      setLevelResponder(guildId, level, reply);

      const warning = isLevelingEnabled(guildId)
        ? ''
        : `\n\nheads up: leveling is OFF in this server ! turn it on with ${inlineCode('/settings levels set enabled:true')}`;
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ level reply set !')
        .setDescription(
          `sako will send this when someone reaches level **${level}** !${warning}`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'show') {
      const level = interaction.options.getInteger('level', true);
      const responder = getLevelResponder(guildId, level);

      if (!responder) {
        await interaction.reply({
          content: `level ${level} doesn't have a reply !`,
        });
        return;
      }

      const embed = serverEmbed(interaction.guild)
        .setTitle(`✦ level ${level} reply !`)
        .setDescription(codeBlock(responder.response));

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'remove') {
      const level = interaction.options.getInteger('level', true);

      if (!removeLevelResponder(guildId, level)) {
        await interaction.reply({
          content: `level ${level} doesn't have a reply !`,
        });
        return;
      }

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ level reply removed !')
        .setDescription(`level **${level}** goes by quietly now !`);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'list') {
      const entries = listLevelResponders(guildId);

      if (entries.length === 0) {
        await interaction.reply({
          content: `no level replies yet ! add one with ${inlineCode('/levels set')}`,
        });
        return;
      }

      const lines = entries.map(
        (entry) =>
          `**level ${entry.level}** · ${entry.responder.response.length} chars`,
      );
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ level replies !')
        .setDescription(lines.join('\n').slice(0, 4096));

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
