import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';

export function registerMessageCreate(client: SakoClient): void {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
  });
}
