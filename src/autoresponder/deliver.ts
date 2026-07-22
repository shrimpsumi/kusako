import type { GuildMember, GuildTextBasedChannel, Message } from 'discord.js';

import { scheduleMessage, scheduleDeletion } from '../scheduler.js';
import { logger } from '../logger.js';
import type { Segment, MessageActions } from './evaluate.js';

export interface DeliveryTarget {
  member: GuildMember;
  channel: GuildTextBasedChannel;
  triggerMessage?: Message;
}

const DM_FAIL_NOTICE = "i couldn't dm you ! check your privacy settings :c";

export async function deliver(
  segments: Segment[],
  actions: MessageActions,
  target: DeliveryTarget,
): Promise<void> {
  const redirect =
    actions.sendToChannelId && actions.sendToChannelId !== target.channel.id
      ? target.channel.guild.channels.cache.get(actions.sendToChannelId)
      : null;
  const base = redirect && redirect.isTextBased() ? redirect : target.channel;

  const destination = actions.dm
    ? await target.member.createDM().catch(() => null)
    : base;

  let firstSent: Message | null = null;

  if (!destination) {
    if (target.triggerMessage) {
      await target.triggerMessage.reply({
        content: DM_FAIL_NOTICE,
        allowedMentions: { parse: [] },
      });
    }
  } else {
    let offset = 0;
    for (const segment of segments) {
      offset += segment.delaySeconds;
      const content = segment.content.slice(0, 2000);
      if (content.length === 0 && segment.embeds.length === 0) continue;

      try {
        if (offset === 0) {
          const sent = await destination.send({
            content: content.length > 0 ? content : undefined,
            embeds: segment.embeds,
            allowedMentions: { parse: ['users', 'roles'] },
          });
          firstSent ??= sent;
        } else {
          scheduleMessage(
            destination.id,
            content,
            offset,
            segment.embeds,
            target.member.guild.id,
          );
        }
      } catch (err) {
        if (!actions.dm) throw err;
        if (target.triggerMessage) {
          await target.triggerMessage.reply({
            content: DM_FAIL_NOTICE,
            allowedMentions: { parse: [] },
          });
        }
        break;
      }
    }
  }

  const reactionSets: Array<[Message | null, string[]]> = [
    [target.triggerMessage ?? firstSent, actions.reactions],
    [firstSent, actions.replyReactions],
  ];
  for (const [reactTarget, emojis] of reactionSets) {
    if (!reactTarget) continue;
    for (const emoji of emojis) {
      try {
        await reactTarget.react(emoji);
      } catch (err) {
        logger.warn({ err, emoji }, 'react failed');
      }
    }
  }

  const members = target.member.guild.members;
  for (const action of actions.roleActions) {
    const options = { user: action.userId, role: action.roleId };
    try {
      if (action.add) await members.addRole(options);
      else await members.removeRole(options);
    } catch (err) {
      logger.warn(
        { err, ...options },
        `${action.add ? 'giverole' : 'takerole'} failed`,
      );
    }
  }

  for (const action of actions.nickActions) {
    try {
      await members.edit(action.userId, { nick: action.nick });
    } catch (err) {
      logger.warn({ err, user: action.userId }, 'setnick failed');
    }
  }

  if (actions.deleteReplyAfter !== null && firstSent && !actions.dm) {
    scheduleDeletion(
      firstSent.channelId,
      firstSent.id,
      actions.deleteReplyAfter,
      target.member.guild.id,
    );
  }

  if (actions.deleteTrigger && target.triggerMessage) {
    try {
      await target.triggerMessage.delete();
    } catch (err) {
      logger.warn({ err }, 'deletetrigger failed');
    }
  }
}
