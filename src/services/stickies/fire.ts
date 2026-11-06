import type { GuildTextBasedChannel } from 'discord.js';

import { getSticky, setStickyMessage, type Sticky } from './store.js';
import { stickyDue } from './due.js';
import { stickyScope } from '../cooldowns.js';
import { parse } from '../../dsl/parser.js';
import { evaluate } from '../../dsl/evaluate.js';
import { deliver } from '../../dsl/deliver.js';
import { logger } from '../../logger.js';

interface ChannelState {
  count: number;
  lastPostedAt: number;
  timer: NodeJS.Timeout | null;
}

const states = new Map<string, ChannelState>();
const posting = new Set<string>();

function stateOf(channelId: string): ChannelState {
  let state = states.get(channelId);
  if (!state) {
    state = { count: 0, lastPostedAt: 0, timer: null };
    states.set(channelId, state);
  }
  return state;
}

export async function postSticky(
  channel: GuildTextBasedChannel,
): Promise<boolean> {
  if (posting.has(channel.id)) return false;
  posting.add(channel.id);

  const state = stateOf(channel.id);
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  try {
    const sticky = getSticky(channel.guildId, channel.id);
    if (!sticky) {
      states.delete(channel.id);
      return false;
    }

    state.count = 0;
    state.lastPostedAt = Date.now();

    const result = await evaluate(
      parse(sticky.response),
      { guild: channel.guild, channel },
      stickyScope(channel.id),
    );
    if (!result.ok) {
      logger.warn(
        {
          guildId: channel.guildId,
          channelId: channel.id,
          reason: result.message,
        },
        'sticky was blocked',
      );
      return false;
    }

    const sent = await deliver(result.segments, result.actions, { channel });
    if (!sent) {
      logger.warn(
        { guildId: channel.guildId, channelId: channel.id },
        'sticky sent nothing',
      );
      return false;
    }

    setStickyMessage(channel.guildId, channel.id, sent.id);
    if (sticky.lastMessageId) {
      await channel.messages.delete(sticky.lastMessageId).catch(() => null);
    }
    return true;
  } catch (err) {
    logger.error(
      { err, guildId: channel.guildId, channelId: channel.id },
      'sticky repost failed',
    );
    return false;
  } finally {
    posting.delete(channel.id);
  }
}

async function checkSticky(
  channel: GuildTextBasedChannel,
  sticky: Sticky,
): Promise<void> {
  if (posting.has(channel.id)) return;

  const state = stateOf(channel.id);
  const wait = stickyDue(sticky, state.count, state.lastPostedAt, Date.now());
  if (wait === null) return;

  if (wait === 0) {
    await postSticky(channel);
    return;
  }

  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    const fresh = getSticky(channel.guildId, channel.id);
    if (!fresh) {
      states.delete(channel.id);
      return;
    }
    void checkSticky(channel, fresh);
  }, wait);
}

export async function noteStickyMessage(
  channel: GuildTextBasedChannel,
): Promise<void> {
  const sticky = getSticky(channel.guildId, channel.id);
  if (!sticky) return;

  stateOf(channel.id).count += 1;
  await checkSticky(channel, sticky);
}
