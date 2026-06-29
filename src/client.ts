import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
} from 'discord.js';

export interface SlashCommand {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface SakoClient extends Client {
  commands: Collection<string, SlashCommand>;
}

export function createClient(): SakoClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message],
  }) as SakoClient;

  client.commands = new Collection();
  return client;
}
