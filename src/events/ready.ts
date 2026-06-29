import { Events } from 'discord.js';

import type { SakoClient } from '../client.js';
import { logger } from '../logger.js';

export function registerReady(client: SakoClient): void {
  client.once(Events.ClientReady, (c) => {
    logger.info(`logged in as ${c.user.tag} (${c.user.id})`);
    logger.info(`serving ${c.guilds.cache.size} guild(s)`);
  });
}
