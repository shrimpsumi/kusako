import type { GuildMember, GuildTextBasedChannel, Message } from 'discord.js';

import { scheduleMessage } from '../scheduler.js';
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
  const destination = actions.dm
    ? await target.member.createDM().catch(() => null)
    : target.channel;

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
          scheduleMessage(destination.id, content, offset, segment.embeds);
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

  const reactTarget = target.triggerMessage ?? firstSent;
  if (reactTarget) {
    for (const emoji of actions.reactions) {
      try {
        await reactTarget.react(emoji);
      } catch (err) {
        logger.warn({ err, emoji }, 'react failed');
      }
    }
  }

  if (actions.deleteTrigger && target.triggerMessage) {
    try {
      await target.triggerMessage.delete();
    } catch (err) {
      logger.warn({ err }, 'deletetrigger failed');
    }
  }
}
