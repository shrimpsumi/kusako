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

        const { actions } = result;

        const destination = actions.dm
          ? await message.author.createDM().catch(() => null)
          : message.channel;

        if (!destination) {
          await message.reply({
            content: "i couldn't dm you ! check your privacy settings c:",
            allowedMentions: { parse: [] },
          });
        } else {
          let offset = 0;
          for (const segment of result.segments) {
            offset += segment.delaySeconds;
            const content = segment.content.slice(0, 2000);
            if (content.length === 0) continue;

            try {
              if (offset === 0) {
                await destination.send({
                  content,
                  allowedMentions: { parse: ['users', 'roles'] },
                });
              } else {
                scheduleMessage(destination.id, content, offset);
              }
            } catch (err) {
              if (!actions.dm) throw err;
              await message.reply({
                content: "i couldn't dm you ! check your privacy settings c:",
                allowedMentions: { parse: [] },
              });
              break;
            }
          }
        }

        for (const emoji of actions.reactions) {
          try {
            await message.react(emoji);
          } catch (err) {
            logger.warn(
              { err, emoji, trigger: responder.trigger },
              'react failed',
            );
          }
        }

        if (actions.deleteTrigger) {
          try {
            await message.delete();
          } catch (err) {
            logger.warn(
              { err, trigger: responder.trigger },
              'deletetrigger failed',
            );
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
