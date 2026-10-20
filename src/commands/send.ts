import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type GuildPremiumTier,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import type { Node } from '../dsl/ast.js';
import { parse } from '../dsl/parser.js';
import { templateIssues } from '../dsl/validate.js';
import { evaluate } from '../dsl/evaluate.js';
import { deliver } from '../dsl/deliver.js';
import { uploadLimit, MB } from '../dsl/files.js';
import { userEmbed, failureEmbed, NO_DMS } from '../utils/style.js';

const MESSAGE_MAX = 2000;

function sendIssues(message: string): string | null {
  const hasCooldown = parse(message).some(
    (node) => node.kind === 'placeholder' && node.name === 'cooldown',
  );
  if (hasCooldown) {
    return "{cooldown} doesn't work here,, sowwy";
  }
  return templateIssues(message);
}

function fileIssues(
  size: number,
  nodes: Node[],
  tier: GuildPremiumTier,
): string | null {
  const uses = (name: string) =>
    nodes.some((node) => node.kind === 'placeholder' && node.name === name);
  if (uses('ephemeral')) {
    return "{ephemeral} can't send files,, take one of them out";
  }
  const dm = uses('dm');
  const limit = uploadLimit(tier, dm);
  if (size > limit) {
    return `that file is too big for me,, i can only upload ${limit / MB}MB ${dm ? 'to dms' : 'here'}`;
  }
  return null;
}

export const send: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('make sako say something... once')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName('message')
        .setDescription('what should i say !')
        .setMaxLength(MESSAGE_MAX),
    )
    .addAttachmentOption((o) =>
      o.setName('file').setDescription('an image or file for me to post'),
    ) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel) {
      await interaction.reply({ content: "i can't see this channel !" });
      return;
    }

    const message = interaction.options.getString('message') ?? '';
    const file = interaction.options.getAttachment('file');

    if (message.trim().length === 0 && !file) {
      await interaction.reply({ content: 'give me something to send !' });
      return;
    }

    const nodes = parse(message);
    const issues =
      sendIssues(message) ??
      (file
        ? fileIssues(file.size, nodes, interaction.guild.premiumTier)
        : null);
    if (issues) {
      await interaction.reply({
        content: issues,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const wantsEphemeral = nodes.some(
      (node) => node.kind === 'placeholder' && node.name === 'ephemeral',
    );

    const result = await evaluate(
      nodes,
      {
        member: interaction.member,
        guild: interaction.guild,
        channel,
      },
      'send',
    );

    if (!result.ok) {
      await interaction.reply({
        embeds: [failureEmbed(result.message)],
        ...(wantsEphemeral ? { flags: MessageFlags.Ephemeral } : {}),
      });
      return;
    }

    if (file) result.actions.files.push(file.url);

    if (!result.actions.ephemeral) {
      const destination = result.actions.dm
        ? 'your dms'
        : result.actions.sendToChannelId &&
            result.actions.sendToChannelId !== channel.id
          ? `<#${result.actions.sendToChannelId}>`
          : null;

      const embed = userEmbed(interaction.user).setTitle('sent !');
      if (destination)
        embed.setDescription(`your message went to ${destination} !`);
      await interaction.reply({ embeds: [embed] });
    }

    await deliver(result.segments, result.actions, {
      member: interaction.member,
      channel,
      interaction,
    });
  },
};
