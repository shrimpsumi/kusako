import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type User,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import { getCurrency, modifyBalance } from '../services/economy/guild.js';
import {
  isGamblingEnabled,
  getGamblingSettings,
} from '../services/games/store.js';
import {
  handValue,
  isBlackjack,
  handEmojis,
  cardBackEmoji,
} from '../services/games/cards.js';
import {
  startGame,
  getGame,
  hasGame,
  hit,
  doubleDown,
  dealerPlay,
  resolve,
  payout,
  credit,
  resultOf,
  endGame,
  type BlackjackGame,
  type Outcome,
} from '../services/games/blackjack.js';
import { settleGame } from '../services/games/stats.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const BJ_PREFIX = 'bj:';

const OUTCOME_COLORS: Record<Outcome, number> = {
  blackjack: 0xffd700,
  win: 0xb8e6c4,
  push: 0xfaf0e7,
  lose: 0xf0b3b3,
  bust: 0xf0b3b3,
};

const OUTCOME_TITLES: Record<Outcome, string> = {
  blackjack: 'blackjack !!',
  win: 'you win !',
  push: 'push !',
  lose: 'dealer wins :c',
  bust: 'bust !!',
};

function gameEmbed(
  user: User,
  game: BlackjackGame,
  revealed: boolean,
  result?: string,
): EmbedBuilder {
  const playerVal = handValue(game.player);
  const dealerCards = revealed
    ? handEmojis(game.dealer)
    : `${handEmojis([game.dealer[0]!])} ${cardBackEmoji()}`;
  const dealerVal = revealed
    ? String(handValue(game.dealer))
    : `${handValue([game.dealer[0]!])} + ?`;

  const lines = [
    `dealer (${dealerVal})`,
    `# ${dealerCards}`,
    '',
    `you (${playerVal})`,
    `# ${handEmojis(game.player)}`,
  ];

  if (result) lines.push('', result);

  return userEmbed(user).setDescription(lines.join('\n'));
}

function actionRow(game: BlackjackGame): ActionRowBuilder<ButtonBuilder> {
  const canDouble = game.player.length === 2 && !game.doubled;
  const id = (action: string) => `${BJ_PREFIX}${game.userId}:${action}`;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(id('hit'))
      .setLabel('hit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id('stand'))
      .setLabel('stand')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id('double'))
      .setLabel('double down')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canDouble),
  );
}

function resultEmbed(
  user: User,
  game: BlackjackGame,
  outcome: Outcome,
  delta: number,
  currency: { emoji: string; name: string },
  balance: number,
): EmbedBuilder {
  const sign = delta > 0 ? '+' : '';
  const deltaLine =
    delta !== 0
      ? `${sign}${currency.emoji} **${delta.toLocaleString('en-US')}**`
      : 'bet returned';

  return gameEmbed(user, game, true, deltaLine)
    .setTitle(OUTCOME_TITLES[outcome])
    .setColor(OUTCOME_COLORS[outcome])
    .setFooter({
      text: `balance: ${balance.toLocaleString('en-US')}`,
    });
}

function finishGame(
  user: User,
  game: BlackjackGame,
  guildId: string,
): { embeds: EmbedBuilder[]; components: [] } {
  dealerPlay(game);
  const outcome = resolve(game);
  const delta = payout(game.bet, outcome);
  const currency = getCurrency(guildId);

  const settled = settleGame(
    guildId,
    game.userId,
    'blackjack',
    resultOf(outcome),
    delta,
    credit(game.bet, outcome),
  );
  endGame(guildId, game.userId);

  return {
    embeds: [
      resultEmbed(user, game, outcome, delta, currency, settled.balance),
    ],
    components: [],
  };
}

export function isBlackjackButton(customId: string): boolean {
  return customId.startsWith(BJ_PREFIX);
}

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const [ownerId, action] = interaction.customId
    .slice(BJ_PREFIX.length)
    .split(':');

  if (ownerId !== interaction.user.id) {
    await interaction.reply({
      content: "that's not your game !",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const game = getGame(interaction.guildId, ownerId);

  if (!game) {
    await interaction.reply({
      content: "that game isn't running anymore !",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  const currency = getCurrency(guildId);

  if (action === 'hit') {
    hit(game);

    if (handValue(game.player) >= 21) {
      await interaction.update(finishGame(interaction.user, game, guildId));
      return;
    }

    await interaction.update({
      embeds: [gameEmbed(interaction.user, game, false)],
      components: [actionRow(game)],
    });
    return;
  }

  if (action === 'stand') {
    await interaction.update(finishGame(interaction.user, game, guildId));
    return;
  }

  if (action === 'double') {
    const extra = modifyBalance(
      guildId,
      game.userId,
      -game.bet,
      'blackjack double down',
    );

    if (!extra.ok) {
      await interaction.reply({
        content: `you need ${currency.emoji} **${game.bet.toLocaleString('en-US')}** more to double down,,, you only have ${extra.balance.toLocaleString('en-US')} !`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    doubleDown(game);
    await interaction.update(finishGame(interaction.user, game, guildId));
    return;
  }
}

export const blackjack: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('play a hand of blackjack !')
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

    if (hasGame(guildId, userId)) {
      await interaction.reply({
        content: 'you already have a hand going ! finish it first',
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

    const deducted = modifyBalance(guildId, userId, -bet, 'blackjack bet');
    if (!deducted.ok) {
      await interaction.reply({
        content: `you only have ${money(deducted.balance)},,, can't bet that much !`,
      });
      return;
    }

    const game = startGame(guildId, userId, bet, (expired) => {
      interaction
        .editReply(finishGame(interaction.user, expired, guildId))
        .catch(() => {});
    });

    if (isBlackjack(game.player)) {
      const result = finishGame(interaction.user, game, guildId);
      await interaction.reply(result);
      return;
    }

    await interaction.reply({
      embeds: [gameEmbed(interaction.user, game, false)],
      components: [actionRow(game)],
    });
  },
};
