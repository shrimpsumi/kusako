import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { listAutoresponders } from '../autoresponder/store.js';
import { matchesTrigger } from '../autoresponder/matcher.js';
import { parse } from '../autoresponder/parser.js';
import { evaluate } from '../autoresponder/evaluate.js';
import { deliver } from '../autoresponder/deliver.js';
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
          if (!result.silent) {
            await message.channel.send({
              content: result.message,
              allowedMentions: { parse: [] },
            });
          }
          continue;
        }

        await deliver(result.segments, result.actions, {
          member: message.member,
          channel: message.channel,
          triggerMessage: message,
        });
      } catch (err) {
        logger.error(
          { err, guild: message.guildId, trigger: responder.trigger },
          'autoresponder failed',
        );
      }
    }
  });
}
