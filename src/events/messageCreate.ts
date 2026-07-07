import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { listAutoresponders } from '../autoresponder/store.js';
import { matchesTrigger } from '../autoresponder/matcher.js';
import { parse } from '../autoresponder/parser.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { scheduleMessage } from '../scheduler.js';
import { logger } from '../logger.js';

export function registerMessageCreate(client: SakoClient): void {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    if (!message.member) return;

    const responders = listAutoresponders(message.guildId);
    if (responders.length === 0) return;

    for (const responder of responders) {
      if (
        !matchesTrigger(message.content, responder.trigger, responder.matchMode)
      ) {
        continue;
      }

      try {
        const result = await evaluate(
          parse(responder.response),
          {
            member: message.member,
            guild: message.guild,
            channel: message.channel,
          },
          responder.triggerKey,
        );

        if (!result.ok) {
          await message.channel.send({
            content: result.message,
            allowedMentions: { parse: [] },
          });
          continue;
        }

        let offset = 0;
        for (const segment of result.segments) {
          offset += segment.delaySeconds;
          const content = segment.content.slice(0, 2000);
          if (content.length === 0) continue;

          if (offset === 0) {
            await message.channel.send({
              content,
              allowedMentions: { parse: ['users', 'roles'] },
            });
          } else {
            scheduleMessage(message.channelId, content, offset);
          }
        }
      } catch (err) {
        logger.error(
          { err, guild: message.guildId, trigger: responder.trigger },
          'autoresponder failed',
        );
      }
    }
  });
}
