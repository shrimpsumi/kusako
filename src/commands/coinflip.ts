import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, modifyBalance } from '../services/economy/guild.js';
import {
  isGamblingEnabled,
  getGamblingSettings,
} from '../services/games/store.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const WIN_LINES = [
  'heads!! you win {{pay}} !',
  'HEADS!! good call, {{pay}} is yours !',
  'heads! you got paid {{pay}}',
];

const LOSE_LINES = [
  'tails... you lost {{pay}} :c',
  'tails !! there goes {{pay}}...',
  'tails... bye bye {{pay}},,',
];

function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]!;
}

export const coinflip: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('flip a coin, double or nothing !')
    .addIntegerOption((o) =>
      o
        .setName('bet')
        .setDescription('how much to wager')
        .setMinValue(1)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!isGamblingEnabled(guildId)) {
      await interaction.reply({
        content: 'gambling is turned off in this server :c',
      });
      return;
    }

    const settings = getGamblingSettings(guildId);
    const bet = interaction.options.getInteger('bet', true);
    const currency = getCurrency(guildId);
    const money = (n: number) =>
      `${currency.emoji} **${n.toLocaleString('en-US')}**`;

    if (bet < settings.minBet) {
      await interaction.reply({
        content: `minimum bet is ${money(settings.minBet)} !`,
      });
      return;
    }

    if (settings.maxBet > 0 && bet > settings.maxBet) {
      await interaction.reply({
        content: `maximum bet is ${money(settings.maxBet)} !`,
      });
      return;
    }

    const won = Math.random() < 0.5;
    const delta = won ? bet : -bet;
    const result = modifyBalance(guildId, userId, delta, 'coinflip');

    if (!result.ok) {
      await interaction.reply({
        content: `you only have ${money(result.balance)},,, can't bet that much !`,
      });
      return;
    }

    const line = pick(won ? WIN_LINES : LOSE_LINES).replaceAll(
      '{{pay}}',
      money(bet),
    );

    const embed = userEmbed(interaction.user)
      .setColor(won ? 0xb8e6c4 : 0xf0b3b3)
      .setDescription(line)
      .setFooter({
        text: `balance: ${result.balance.toLocaleString('en-US')}`,
      });

    await interaction.reply({ embeds: [embed] });
  },
};
