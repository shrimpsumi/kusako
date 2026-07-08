import { Events, MessageFlags } from 'discord.js';

import type { SakoClient } from '../client.js';
import { handleEmbedComponents } from '../commands/embeds.js';
import { logger } from '../logger.js';

export function registerInteractionCreate(client: SakoClient): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (
      (interaction.isButton() || interaction.isModalSubmit()) &&
      interaction.customId.startsWith('embeds:')
    ) {
      try {
        await handleEmbedComponents(interaction);
      } catch (err) {
        logger.error({ err, id: interaction.customId }, 'embed panel failed');
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (err) {
        logger.error(
          { err, name: interaction.commandName },
          'autocomplete failed',
        );
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn({ name: interaction.commandName }, 'unknown command');
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, name: interaction.commandName }, 'command failed');
      const content = 'something broke running that command. check the logs.';
      if (interaction.replied || interaction.deferred) {
        await interaction
          .followUp({ content, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      } else {
        await interaction
          .reply({ content, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });
}
