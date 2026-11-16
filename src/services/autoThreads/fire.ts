import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  MessageType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildMember,
  type Message,
} from 'discord.js';

import { getAutoThread } from './store.js';
import { threadName } from './name.js';
import { autoThreadScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { logger } from '../../logger.js';

const CLOSE_PREFIX = 'autothread:close:';

export function isAutoThreadCloseId(customId: string): boolean {
  return customId.startsWith(CLOSE_PREFIX);
}

function closeRow(posterId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CLOSE_PREFIX}${posterId}`)
      .setLabel('close thread')
      .setStyle(ButtonStyle.Danger),
  );
}

export async function fireAutoThread(
  message: Message<true>,
  member: GuildMember,
): Promise<void> {
  if (message.type !== MessageType.Default) return;

  const config = getAutoThread(message.guildId, message.channelId);
  if (!config) return;

  const result = await evaluate(
    parse(config.response),
    {
      member,
      guild: message.guild,
      channel: message.channel,
      message,
      messageArgs: message.content.split(/\s+/).filter((w) => w.length > 0),
    },
    autoThreadScope(config.channelId),
  );
  if (!result.ok) return;

  const thread = await message.startThread({
    name: threadName(message.author.username, message.cleanContent),
    rateLimitPerUser: config.slowmodeSeconds,
  });

  await deliver(result.segments, result.actions, {
    member,
    channel: thread,
    triggerMessage: message,
    extraRow: config.closeButton ? closeRow(message.author.id) : undefined,
  });
}

export async function closeAutoThread(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const thread = interaction.channel;
  if (!thread?.isThread()) return;

  const posterId = interaction.customId.slice(CLOSE_PREFIX.length);
  const staff = interaction.memberPermissions.has(
    PermissionFlagsBits.ManageThreads,
  );
  if (interaction.user.id !== posterId && !staff) {
    await interaction.reply({
      content: "this one isn't yours to close !",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const config = thread.parentId
    ? getAutoThread(interaction.guildId, thread.parentId)
    : null;
  const lock = config?.lock ?? false;

  try {
    await thread.edit({
      archived: true,
      ...(lock ? { locked: true } : {}),
      reason: `thread closed by ${interaction.user.tag}`,
    });
  } catch (err) {
    logger.error({ err, thread: thread.id }, 'auto-thread close failed');
    await interaction.editReply(
      lock
        ? "i couldn't close this one,, i need manage threads to lock it !"
        : "i couldn't close this one,, check my permissions and try again !",
    );
    return;
  }

  await interaction.editReply(lock ? 'closed and locked !' : 'closed !');
}
