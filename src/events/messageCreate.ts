import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { listAutoresponders } from '../autoresponder/store.js';
import { matchesTrigger } from '../autoresponder/matcher.js';
import { parse } from '../autoresponder/parser.js';
import { render } from '../autoresponder/render.js';
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
        const content = await render(parse(responder.response), {
          member: message.member,
          guild: message.guild,
          channel: message.channel,
        });

        if (content.trim().length === 0) continue;

        await message.channel.send({
          content: content.slice(0, 2000),
          allowedMentions: { parse: ['users', 'roles'] },
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
