import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, setCurrency } from '../economy.js';
import {
  getPatSettings,
  setPatSettings,
  isGameEnabled,
  setGameEnabled,
} from '../games.js';
import { formatDuration } from '../autoresponder/args.js';
import { serverEmbed } from '../style.js';

export const settings: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('configure sako for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('see the current server settings'),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('currency')
        .setDescription('economy + currency settings')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('change the server currency')
            .addStringOption((o) =>
              o
                .setName('name')
                .setDescription('what the currency is called, e.g. curds')
                .setMaxLength(32)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('emoji')
                .setDescription('the emoji shown next to it')
                .setMaxLength(64)
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('pat')
        .setDescription('head pat minigame settings')
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('tune the head pat minigame')
            .addIntegerOption((o) =>
              o
                .setName('min')
                .setDescription('smallest reward per pat (default 30)')
                .setMinValue(1)
                .setMaxValue(1_000_000),
            )
            .addIntegerOption((o) =>
              o
                .setName('max')
                .setDescription('biggest reward per pat (default 60)')
                .setMinValue(1)
                .setMaxValue(1_000_000),
            )
            .addIntegerOption((o) =>
              o
                .setName('cooldown')
                .setDescription('minutes between pats (default 60)')
                .setMinValue(1)
                .setMaxValue(10_080),
            )
            .addBooleanOption((o) =>
              o
                .setName('enabled')
                .setDescription('turn /pat on or off for this server'),
            ),
        ),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'settings only exist inside a server !!',
      });
      return;
    }

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === null && sub === 'view') {
      const currency = getCurrency(guildId);
      const pat = getPatSettings(guildId);
      const patValue = isGameEnabled(guildId, 'pat')
        ? `${currency.emoji} ${pat.minReward.toLocaleString('en-US')}-${pat.maxReward.toLocaleString('en-US')} per pat, every ${formatDuration(pat.cooldownSeconds)}`
        : 'disabled';

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ sako settings !')
        .addFields(
          {
            name: 'currency',
            value: `${currency.emoji} ${currency.name}`,
            inline: true,
          },
          {
            name: 'head pats',
            value: patValue,
            inline: true,
          },
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'currency' && sub === 'set') {
      const name = interaction.options.getString('name', true);
      const emoji = interaction.options.getString('emoji', true);
      setCurrency(guildId, { name, emoji });

      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ currency updated !')
        .setDescription(`this server's currency is now ${emoji} **${name}** !`);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (group === 'pat' && sub === 'set') {
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      const cooldown = interaction.options.getInteger('cooldown');
      const enabled = interaction.options.getBoolean('enabled');

      if (
        min === null &&
        max === null &&
        cooldown === null &&
        enabled === null
      ) {
        await interaction.reply({
          content:
            'give me something to change !! (min, max, cooldown, and/or enabled)',
        });
        return;
      }

      const current = getPatSettings(guildId);
      const nextMin = min ?? current.minReward;
      const nextMax = max ?? current.maxReward;
      if (nextMin > nextMax) {
        await interaction.reply({
          content: `min can't be bigger than max !! that would make the range ${nextMin.toLocaleString('en-US')}-${nextMax.toLocaleString('en-US')}`,
        });
        return;
      }

      setPatSettings(guildId, {
        ...(min !== null ? { minReward: min } : {}),
        ...(max !== null ? { maxReward: max } : {}),
        ...(cooldown !== null ? { cooldownSeconds: cooldown * 60 } : {}),
      });
      if (enabled !== null) setGameEnabled(guildId, 'pat', enabled);

      const now = getPatSettings(guildId);
      const currency = getCurrency(guildId);
      const state = isGameEnabled(guildId, 'pat') ? 'on' : 'off';
      const embed = serverEmbed(interaction.guild)
        .setTitle('✦ head pats updated !')
        .setDescription(
          `reward: ${currency.emoji} **${now.minReward.toLocaleString('en-US')}-${now.maxReward.toLocaleString('en-US')} ${currency.name}**, cooldown: **${formatDuration(now.cooldownSeconds)}**, pats are **${state}** !`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }
  },
};
