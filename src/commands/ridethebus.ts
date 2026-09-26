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
import { isUsableEmoji } from '../services/buttons/registry.js';
import { checkBet } from '../services/games/store.js';
import {
  cardEmoji,
  cardBackEmoji,
  type Card,
  type Suit,
} from '../services/games/cards.js';
import {
  ROUNDS,
  startGame,
  getGame,
  hasGame,
  canPick,
  play,
  isCleared,
  isTie,
  credit,
  resultOf,
  endGame,
  type BusGame,
  type Pick,
} from '../services/games/ridethebus.js';
import { settleGame } from '../services/games/stats.js';
import { userEmbed, NO_DMS } from '../utils/style.js';

const RTB_PREFIX = 'rtb:';

const PLAYING_COLOR = 0xf2d388;

type Ending = 'cleared' | 'cashout' | 'loss' | 'timeout';

const SUIT_EMOJIS: Record<Suit, string> = {
  hearts: '♥️',
  diamonds: '♦️',
  clubs: '♣️',
  spades: '♠️',
};

const n = (value: number) => value.toLocaleString('en-US');

function rankName(card: Card): string {
  return card.rank.replace(/^0/, '');
}

function article(rank: string): string {
  return rank === '8' || rank === 'A' ? 'an' : 'a';
}

function roundText(game: BusGame): {
  heading: string;
  ask: string;
  note: string;
} {
  const [first, second] = game.cards;
  const pays = `win this one for ${ROUNDS[game.cards.length]!.pays}×`;

  if (!first) {
    return {
      heading: 'round 1 · red or black',
      ask: 'is the first card red or black?',
      note: pays,
    };
  }

  if (!second) {
    return {
      heading: 'round 2 · higher or lower',
      ask: `is the next card higher or lower than the ${rankName(first)}?`,
      note: `a tie loses · ${pays}`,
    };
  }

  if (game.cards.length === 2) {
    const [a, b] = [rankName(first), rankName(second)];
    return {
      heading: 'round 3 · inside or outside',
      ask: `is the next card inside or outside the ${a} and the ${b}?`,
      note: `landing on ${article(a)} ${a} or ${b} loses · ${pays}`,
    };
  }

  return {
    heading: 'last round · pick the suit',
    ask: 'what suit is the last card?',
    note: pays,
  };
}

function playingEmbed(user: User, game: BusGame): EmbedBuilder {
  const { heading, ask, note } = roundText(game);
  const cards = [...game.cards.map(cardEmoji), cardBackEmoji()].join(' ');

  return userEmbed(user)
    .setColor(PLAYING_COLOR)
    .setDescription(
      [`## ${heading}`, `# ${cards}`, ask, `-# ${note}`].join('\n'),
    )
    .setFooter({ text: `bet ${n(game.bet)}` });
}

function pickStyle(pick: Pick): ButtonStyle {
  if (pick === 'red') return ButtonStyle.Danger;
  if (pick === 'black' || pick === 'hearts' || pick === 'diamonds') {
    return ButtonStyle.Secondary;
  }
  return ButtonStyle.Primary;
}

function gameRows(game: BusGame): ActionRowBuilder<ButtonBuilder>[] {
  const id = (action: string) => `${RTB_PREFIX}${game.userId}:${action}`;

  const picks = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ROUNDS[game.cards.length]!.picks.map((pick) => {
      const button = new ButtonBuilder()
        .setCustomId(id(pick))
        .setStyle(pickStyle(pick));
      return pick in SUIT_EMOJIS
        ? button.setEmoji(SUIT_EMOJIS[pick as Suit])
        : button.setLabel(pick);
    }),
  );

  if (game.cards.length === 0) return [picks];

  const { emoji } = getCurrency(game.guildId);
  const cashout = new ButtonBuilder()
    .setCustomId(id('cashout'))
    .setLabel(`cash out ${n(credit(game))}`)
    .setStyle(ButtonStyle.Success);
  if (isUsableEmoji(emoji)) cashout.setEmoji(emoji);

  return [picks, new ActionRowBuilder<ButtonBuilder>().addComponents(cashout)];
}

function playingPayload(user: User, game: BusGame) {
  return { embeds: [playingEmbed(user, game)], components: gameRows(game) };
}

function endingText(
  game: BusGame,
  ending: Ending,
  pick?: Pick,
): { heading: string; color: number; note?: string } {
  if (ending === 'cleared') {
    return { heading: 'you rode the bus !!', color: 0xffd700 };
  }

  if (ending === 'loss') {
    const last = game.cards.at(-1)!;
    const tie = isTie(game.cards.slice(0, -1), last);
    return {
      heading: 'wrong guess :c',
      color: 0xf0b3b3,
      note: `you picked ${pick}${tie ? ', and a tie loses' : ''}`,
    };
  }

  if (ending === 'timeout' && game.cards.length === 0) {
    return {
      heading: 'too slow :c',
      color: 0xf0b3b3,
      note: "you didn't pick in time, so the bet's gone",
    };
  }

  return {
    heading: 'cashed out !',
    color: 0xb8e6c4,
    note:
      ending === 'timeout'
        ? "you didn't pick in time, so i cashed you out"
        : undefined,
  };
}

function finishGame(
  user: User,
  game: BusGame,
  ending: Ending,
  pick?: Pick,
): { embeds: EmbedBuilder[]; components: [] } {
  const paid = ending === 'loss' ? 0 : credit(game);
  const delta = paid - game.bet;
  const currency = getCurrency(game.guildId);

  const settled = settleGame(
    game.guildId,
    game.userId,
    'ridethebus',
    resultOf(paid),
    delta,
    paid,
  );
  endGame(game.guildId, game.userId);

  const { heading, color, note } = endingText(game, ending, pick);
  const cards =
    game.cards.length > 0
      ? game.cards.map(cardEmoji).join(' ')
      : cardBackEmoji();
  const sign = delta > 0 ? '+' : '-';

  const lines = [
    `## ${heading}`,
    `# ${cards}`,
    `${sign}${currency.emoji} **${n(Math.abs(delta))}**`,
  ];
  if (note) lines.push(`-# ${note}`);

  return {
    embeds: [
      userEmbed(user)
        .setColor(color)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `balance: ${n(settled.balance)}` }),
    ],
    components: [],
  };
}

export function isRideTheBusButton(customId: string): boolean {
  return customId.startsWith(RTB_PREFIX);
}

export async function handleRideTheBusButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const [ownerId, action] = interaction.customId
    .slice(RTB_PREFIX.length)
    .split(':');

  if (ownerId !== interaction.user.id) {
    await interaction.reply({
      content: "that's not your game !",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const game = getGame(interaction.guildId, ownerId);
  const pick = action as Pick;
  const live =
    game !== null &&
    (action === 'cashout' ? game.cards.length > 0 : canPick(game, pick));

  if (!live) {
    await interaction.reply({
      content: "that game isn't running anymore !",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'cashout') {
    await interaction.update(finishGame(interaction.user, game, 'cashout'));
    return;
  }

  if (!play(game, pick)) {
    await interaction.update(finishGame(interaction.user, game, 'loss', pick));
    return;
  }

  if (isCleared(game)) {
    await interaction.update(finishGame(interaction.user, game, 'cleared'));
    return;
  }

  await interaction.update(playingPayload(interaction.user, game));
}

export const ridethebus: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ridethebus')
    .setDescription('guess your way through four cards, cash out whenever !')
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

    if (hasGame(guildId, userId)) {
      await interaction.reply({
        content: "you're already on the bus ! finish that game first",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const bet = interaction.options.getInteger('bet', true);
    const rejected = checkBet(guildId, userId, bet);
    if (rejected) {
      await interaction.reply({ content: rejected });
      return;
    }

    const currency = getCurrency(guildId);
    const deducted = modifyBalance(guildId, userId, -bet, 'ridethebus bet');
    if (!deducted.ok) {
      await interaction.reply({
        content: `you only have ${currency.emoji} **${n(deducted.balance)}**,,, can't bet that much !`,
      });
      return;
    }

    const game = startGame(guildId, userId, bet, (expired) => {
      interaction
        .editReply(finishGame(interaction.user, expired, 'timeout'))
        .catch(() => {});
    });

    await interaction.reply(playingPayload(interaction.user, game));
  },
};
