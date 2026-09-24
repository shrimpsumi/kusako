import { EmbedBuilder, SlashCommandBuilder, escapeMarkdown } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getBalance, getCurrency } from '../services/economy/guild.js';
import {
  GLOBAL_CURRENCIES,
  GLOBAL_CURRENCY_IDS,
  getGlobalBalances,
} from '../services/economy/global.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const COLOR = 0xa8c8e8;
const NO_BUFF = '-# ╰ no buff active';

function currencyLines(emoji: string, amount: number, name: string) {
  return [`${emoji} **${amount.toLocaleString('en-US')}** ${name}`, NO_BUFF];
}

export const balance: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('check your balance !')
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription("peek at someone else's balance")
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
    const self = target.id === interaction.user.id;
    const targetMember = self
      ? interaction.member
      : interaction.options.getMember('user');
    const nickname = targetMember?.displayName ?? target.displayName;

    const currency = getCurrency(interaction.guildId);
    const amount = getBalance(interaction.guildId, target.id);
    const globalBalances = getGlobalBalances(target.id);

    const pockets = userEmbed(target)
      .setAuthor({
        name: `${nickname}'s pockets`,
        iconURL: target.displayAvatarURL(),
      })
      .setColor(COLOR)
      .setDescription(
        [
          `### ***${escapeMarkdown(interaction.guild.name)}***`,
          ...currencyLines(currency.emoji, amount, currency.name),
          '### ***everywhere***',
          ...GLOBAL_CURRENCY_IDS.flatMap((id) =>
            currencyLines(
              GLOBAL_CURRENCIES[id].emoji,
              globalBalances[id],
              GLOBAL_CURRENCIES[id].name,
            ),
          ),
        ].join('\n'),
      );

    const stash = new EmbedBuilder()
      .setColor(COLOR)
      .setDescription(
        self
          ? 'nothing in your stash yet...'
          : `nothing in ${nickname}'s stash yet...`,
      );

    await interaction.reply({ embeds: [pockets, stash] });
  },
};
