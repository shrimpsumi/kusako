import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type SlashCommandSubcommandBuilder,
  type SlashCommandUserOption,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  getXp,
  setXp,
  modifyXp,
  levelFromXp,
  totalXpForLevel,
  MAX_LEVEL,
} from '../levels.js';
import { fireLevelUps } from '../levelups.js';
import { serverEmbed } from '../style.js';

function userOption(o: SlashCommandUserOption): SlashCommandUserOption {
  return o.setName('user').setDescription('whose levels').setRequired(true);
}

function xpSub(
  sub: SlashCommandSubcommandBuilder,
  name: string,
  description: string,
  minAmount: number,
): SlashCommandSubcommandBuilder {
  return sub
    .setName(name)
    .setDescription(description)
    .addUserOption(userOption)
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('how much xp')
        .setMinValue(minAmount)
        .setRequired(true),
    );
}

function levelSub(
  sub: SlashCommandSubcommandBuilder,
  name: string,
  description: string,
  minAmount: number,
): SlashCommandSubcommandBuilder {
  return sub
    .setName(name)
    .setDescription(description)
    .addUserOption(userOption)
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('how many levels')
        .setMinValue(minAmount)
        .setMaxValue(MAX_LEVEL)
        .setRequired(true),
    );
}

export const modifylevel: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('modifylevel')
    .setDescription("edit a member's xp and level")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName('xp')
        .setDescription('edit raw xp')
        .addSubcommand((sub) =>
          xpSub(sub, 'add', 'give a member xp (fires level up replies !)', 1),
        )
        .addSubcommand((sub) =>
          xpSub(sub, 'remove', 'take xp from a member (silent)', 1),
        )
        .addSubcommand((sub) =>
          xpSub(sub, 'set', "set a member's exact xp (silent)", 0),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('level')
        .setDescription('edit whole levels')
        .addSubcommand((sub) =>
          levelSub(
            sub,
            'add',
            'raise a member some levels (fires level up replies !)',
            1,
          ),
        )
        .addSubcommand((sub) =>
          levelSub(sub, 'remove', 'lower a member some levels (silent)', 1),
        )
        .addSubcommand((sub) =>
          levelSub(sub, 'set', "set a member's exact level (silent)", 1),
        ),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: 'levels only exist inside a server !!',
      });
      return;
    }

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();
    const member = interaction.options.getMember('user');
    const amount = interaction.options.getInteger('amount', true);

    if (!member) {
      await interaction.reply({
        content: "that user isn't in this server !",
      });
      return;
    }
    if (member.user.bot) {
      await interaction.reply({
        content: "bots don't level up !!",
      });
      return;
    }

    const before = getXp(guildId, member.id);
    const beforeLevel = levelFromXp(before);

    let result;
    if (group === 'xp') {
      result =
        sub === 'set'
          ? setXp(guildId, member.id, amount)
          : modifyXp(guildId, member.id, sub === 'add' ? amount : -amount);
    } else {
      const targetLevel =
        sub === 'set'
          ? amount
          : sub === 'add'
            ? Math.min(beforeLevel + amount, MAX_LEVEL)
            : Math.max(beforeLevel - amount, 1);
      result = setXp(guildId, member.id, totalXpForLevel(targetLevel));
    }

    if (!result.ok) {
      await interaction.reply({
        content: `${member.displayName} only has ${result.xp.toLocaleString('en-US')} xp, can't remove that much !`,
      });
      return;
    }

    const afterLevel = levelFromXp(result.xp);
    const summary = `${member} is now level **${afterLevel}** with **${result.xp.toLocaleString('en-US')}** xp !`;

    const embed = serverEmbed(interaction.guild)
      .setTitle('✦ levels updated !')
      .setDescription(summary);

    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    if (sub === 'add' && afterLevel > beforeLevel && interaction.channel) {
      await fireLevelUps(member, interaction.channel, beforeLevel, afterLevel);
    }
  },
};
