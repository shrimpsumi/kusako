import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency } from '../services/economy/guild.js';
import { checkBet } from '../services/games/store.js';
import { settleGame } from '../services/games/stats.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const SIDES = ['heads', 'tails'] as const;

const WIN_LINES = [
  '{{side}}!! you win {{pay}} !',
  '{{SIDE}}!! good call, {{pay}} is yours !',
  '{{side}}! you got paid {{pay}}',
];

const LOSE_LINES = [
  '{{side}}... you lost {{pay}} :c',
  '{{side}} !! there goes {{pay}}...',
  '{{side}}... bye bye {{pay}},,',
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
    )
    .addStringOption((o) =>
      o
        .setName('side')
        .setDescription('heads or tails')
        .setRequired(true)
        .addChoices(...SIDES.map((side) => ({ name: side, value: side }))),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const bet = interaction.options.getInteger('bet', true);
    const rejected = checkBet(guildId, userId, bet);
    if (rejected) {
      await interaction.reply({ content: rejected });
      return;
    }

    const currency = getCurrency(guildId);
    const money = (n: number) =>
      `${currency.emoji} **${n.toLocaleString('en-US')}**`;

    const call = interaction.options.getString('side', true);
    const landed = pick([...SIDES]);
    const won = landed === call;
    const delta = won ? bet : -bet;
    const result = settleGame(
      guildId,
      userId,
      'coinflip',
      won ? 'win' : 'loss',
      delta,
      delta,
    );

    if (!result.ok) {
      await interaction.reply({
        content: `you only have ${money(result.balance)},,, can't bet that much !`,
      });
      return;
    }

    const line = pick(won ? WIN_LINES : LOSE_LINES)
      .replaceAll('{{pay}}', money(bet))
      .replaceAll('{{side}}', landed)
      .replaceAll('{{SIDE}}', landed.toUpperCase());

    const embed = userEmbed(interaction.user)
      .setColor(won ? 0xb8e6c4 : 0xf0b3b3)
      .setDescription(line)
      .setFooter({
        text: `balance: ${result.balance.toLocaleString('en-US')}`,
      });

    await interaction.reply({ embeds: [embed] });
  },
};
