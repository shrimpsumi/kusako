import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency } from '../services/economy/guild.js';
import {
  isGamblingEnabled,
  getGamblingSettings,
} from '../services/games/store.js';
import {
  BETS,
  OUTSIDE_BETS,
  parseBet,
  payout,
  pocketColor,
  pocketLabel,
  spin,
} from '../services/games/roulette.js';
import { settleGame } from '../services/games/stats.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const COLOR_EMOJI = {
  green: '🟢',
  red: '🔴',
  black: '⚫',
} as const;

const EMPTY_SUGGESTIONS = BETS.filter(
  (bet) => OUTSIDE_BETS.includes(bet) || bet.name === '0' || bet.name === '00',
);

export const roulette: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('spin the roulette wheel !')
    .addIntegerOption((o) =>
      o
        .setName('bet')
        .setDescription('how much to wager')
        .setMinValue(1)
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('on')
        .setDescription('what to bet on, like red, 1st 12, or 17')
        .setAutocomplete(true)
        .setRequired(true),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().trim().toLowerCase();
    const matches = focused
      ? BETS.filter((bet) => bet.name.includes(focused))
      : EMPTY_SUGGESTIONS;

    await interaction.respond(
      matches.slice(0, 25).map((bet) => ({ name: bet.name, value: bet.name })),
    );
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!isGamblingEnabled(guildId)) {
      await interaction.reply({
        content: 'gambling is turned off in this server!',
      });
      return;
    }

    const settings = getGamblingSettings(guildId);
    const amount = interaction.options.getInteger('bet', true);
    const currency = getCurrency(guildId);
    const money = (n: number) =>
      `${currency.emoji} **${n.toLocaleString('en-US')}**`;

    if (amount < settings.minBet) {
      await interaction.reply({
        content: `minimum bet is ${money(settings.minBet)} !`,
      });
      return;
    }

    if (settings.maxBet > 0 && amount > settings.maxBet) {
      await interaction.reply({
        content: `maximum bet is ${money(settings.maxBet)} !`,
      });
      return;
    }

    const bet = parseBet(interaction.options.getString('on', true));

    if (!bet) {
      await interaction.reply({
        content: "i don't know that bet! try red, 1st 12, or a number like 17",
      });
      return;
    }

    const pocket = spin();
    const delta = payout(amount, bet, pocket);
    const won = delta > 0;

    const result = settleGame(
      guildId,
      userId,
      'roulette',
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

    const embed = userEmbed(interaction.user)
      .setColor(won ? 0xb8e6c4 : 0xf0b3b3)
      .setDescription(
        [
          `you bet on **${bet.name}**`,
          `# ${COLOR_EMOJI[pocketColor(pocket)]} ${pocketLabel(pocket)}`,
          won ? `you won +${money(delta)} !` : `you lost ${money(amount)} :c`,
        ].join('\n'),
      )
      .setFooter({
        text: `balance: ${result.balance.toLocaleString('en-US')}`,
      });

    await interaction.reply({ embeds: [embed] });
  },
};
