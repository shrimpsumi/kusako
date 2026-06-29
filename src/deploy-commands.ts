import { REST, Routes } from 'discord.js';

import { env } from './env.js';
import { commands } from './commands/index.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const global = args.includes('--global');
  const clear = args.includes('--clear');

  const rest = new REST({ version: '10' }).setToken(env.botToken);

  const body = clear ? [] : commands.map((c) => c.data.toJSON());
  const route = global
    ? Routes.applicationCommands(env.clientId)
    : Routes.applicationGuildCommands(env.clientId, requireGuild());

  const scope = global ? 'global' : `guild ${env.guildId}`;
  const action = clear ? 'clearing' : `deploying ${body.length} command(s) to`;
  logger.info(`${action} ${scope}...`);

  await rest.put(route, { body });
  logger.info('done');
}

function requireGuild(): string {
  if (!env.guildId) {
    throw new Error(
      'GUILD_ID required for guild-scoped deploy. use --global to deploy globally.',
    );
  }
  return env.guildId;
}

main().catch((err) => {
  logger.fatal({ err }, 'deploy failed');
  process.exit(1);
});
