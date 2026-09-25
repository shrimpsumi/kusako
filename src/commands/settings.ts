import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  inlineCode,
  ChannelType,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type StringSelectMenuInteraction,
} from 'discord.js';

import type { SlashCommand } from '../client.js';
import {
  groups,
  findGroup,
  findSetting,
  type SettingEntry,
  type SettingGroup,
} from '../services/settings/registry.js';
import { commandMention } from '../utils/commandMentions.js';
import { setGuildSetting } from '../services/guildSettings.js';
import {
  TICKET_CATEGORY_KEY,
  TICKET_ARCHIVE_KEY,
} from '../services/tickets/store.js';
import { missingTicketPerms } from '../services/tickets/fire.js';
import { setCurrency } from '../services/economy/guild.js';
import {
  getPatSettings,
  setPatSettings,
  getGamblingSettings,
  setGamblingSettings,
  setGamblingEnabled,
  setGameEnabled,
} from '../services/games/store.js';
import { setLevelingEnabled } from '../services/levels/store.js';
import {
  isValidTimeZone,
  setGuildTimezone,
  timeZoneChoices,
} from '../services/timezone.js';
import { serverEmbed, NO_DMS } from '../utils/style.js';

const ARROW = '<:arrowright:1545483910022959194>';

function groupSelect(selected: string | null) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('settings:group')
      .setPlaceholder('pick a group')
      .addOptions(
        groups().map((group) => ({
          label: group.label,
          value: group.id,
          default: group.id === selected,
        })),
      ),
  );
}

function settingSelect(group: SettingGroup) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('settings:setting')
      .setPlaceholder('pick a setting')
      .addOptions(
        group.settings.map((setting) => ({
          label: setting.label,
          value: setting.id,
        })),
      ),
  );
}

function homeRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('settings:home')
      .setLabel('← all groups')
      .setStyle(ButtonStyle.Secondary),
  );
}

function overviewPayload(guild: Guild) {
  const blocks = groups().map(
    (group) => `### ***${group.label}***\n${group.description}`,
  );

  const embed = serverEmbed(guild)
    .setTitle('settings !')
    .setDescription(
      [...blocks, '', `${ARROW} pick a group below to see its settings`].join(
        '\n',
      ),
    );

  return { embeds: [embed], components: [groupSelect(null)] };
}

function groupPayload(guild: Guild, groupId: string) {
  const group = findGroup(groupId);
  if (!group) return overviewPayload(guild);

  const embed = serverEmbed(guild)
    .setTitle(`${group.label} !`)
    .setDescription(group.description)
    .addFields(
      group.settings.map((setting) => ({
        name: setting.label,
        value: setting.knobs
          .map((knob) => `${knob.option} · **${knob.value(guild.id)}**`)
          .join('\n'),
        inline: true,
      })),
    );

  return {
    embeds: [embed],
    components: [groupSelect(group.id), settingSelect(group), homeRow()],
  };
}

function changeLine(setting: SettingEntry): string {
  const commands = [...new Set(setting.knobs.map((knob) => knob.command))];
  if (commands.length === 1) {
    return `change it with ${commandMention(commands[0]!)} :3`;
  }

  const parts = commands.map((command) => {
    const options = setting.knobs
      .filter((knob) => knob.command === command)
      .map((knob) => knob.option);
    return `the ${options.join(' and ')} with ${commandMention(command)}`;
  });
  return `change ${parts.join(' and ')}`;
}

function settingEmbed(guild: Guild, setting: SettingEntry) {
  return serverEmbed(guild).setDescription(`${ARROW} ${changeLine(setting)}`);
}

export async function handleSettingsComponents(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'you need **manage server** to change settings !',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { guild } = interaction;

  if (interaction.isButton()) {
    await interaction.update(overviewPayload(guild));
    return;
  }

  const choice = interaction.values[0] ?? '';

  if (interaction.customId === 'settings:group') {
    await interaction.update(groupPayload(guild, choice));
    return;
  }

  const setting = findSetting(choice);
  if (!setting) {
    await interaction.reply({
      content: "i don't know that setting,, run /settings view again !",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    embeds: [settingEmbed(guild, setting)],
    flags: MessageFlags.Ephemeral,
  });
}

function settingsReply(
  guild: Guild,
  heading: string,
  body: string[],
  notes: string[] = [],
) {
  const lines = [`## ${heading}`, ...body];
  if (notes.length > 0) lines.push('', ...notes.map((note) => `> ${note}`));
  lines.push(
    '',
    `${ARROW} see everything with ${commandMention('/settings view')}`,
  );
  return { embeds: [serverEmbed(guild).setDescription(lines.join('\n'))] };
}

function updatedReply(
  interaction: ChatInputCommandInteraction<'cached'>,
  setting: SettingEntry,
  notes: string[] = [],
) {
  const lines = setting.knobs
    .filter((knob) => interaction.options.get(knob.option) !== null)
    .map((knob) => `${knob.option}: ${knob.value(interaction.guildId)}`);

  return settingsReply(
    interaction.guild,
    `settings updated for ${inlineCode(setting.label)}`,
    lines,
    notes,
  );
}

export const settings: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('configure sako for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('view').setDescription("see and change sako's settings"),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('set')
        .setDescription('change a setting')
        .addSubcommand((sub) =>
          sub
            .setName('currency')
            .setDescription('change the server currency')
            .addStringOption((o) =>
              o
                .setName('name')
                .setDescription('what the currency is called, e.g. maru')
                .setMaxLength(32)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName('emoji')
                .setDescription('the emoji shown next to it')
                .setMaxLength(64)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('pat')
            .setDescription('tune the head pat minigame')
            .addIntegerOption((o) =>
              o
                .setName('min')
                .setDescription('smallest reward per pat')
                .setMinValue(1)
                .setMaxValue(1_000_000),
            )
            .addIntegerOption((o) =>
              o
                .setName('max')
                .setDescription('biggest reward per pat')
                .setMinValue(1)
                .setMaxValue(1_000_000),
            )
            .addIntegerOption((o) =>
              o
                .setName('cooldown')
                .setDescription('minutes between pats')
                .setMinValue(1)
                .setMaxValue(10_080),
            )
            .addBooleanOption((o) =>
              o
                .setName('enabled')
                .setDescription('turn /pat on or off for this server'),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('gambling')
            .setDescription('configure coinflip and other gambling games')
            .addIntegerOption((o) =>
              o
                .setName('min')
                .setDescription('smallest bet allowed')
                .setMinValue(1)
                .setMaxValue(1_000_000),
            )
            .addIntegerOption((o) =>
              o
                .setName('max')
                .setDescription('biggest bet allowed, 0 for no limit')
                .setMinValue(0)
                .setMaxValue(1_000_000_000),
            )
            .addBooleanOption((o) =>
              o
                .setName('enabled')
                .setDescription('turn gambling on or off for this server'),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('levels')
            .setDescription('turn leveling on or off')
            .addBooleanOption((o) =>
              o
                .setName('enabled')
                .setDescription('should members earn xp in this server?')
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('tickets')
            .setDescription('which categories tickets go in')
            .addChannelOption((o) =>
              o
                .setName('category')
                .setDescription('where new tickets open')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(false),
            )
            .addChannelOption((o) =>
              o
                .setName('archive')
                .setDescription('where closed tickets move to')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('timezone')
            .setDescription('set the timezone sako uses for scheduled posts')
            .addStringOption((o) =>
              o
                .setName('zone')
                .setDescription('a timezone like America/Chicago')
                .setAutocomplete(true)
                .setRequired(true),
            ),
        ),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    await interaction.respond(
      timeZoneChoices(interaction.options.getFocused()),
    );
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: NO_DMS,
      });
      return;
    }

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === null && sub === 'view') {
      await interaction.reply(overviewPayload(interaction.guild));
      return;
    }

    if (group === 'set' && sub === 'currency') {
      const name = interaction.options.getString('name', true);
      const emoji = interaction.options.getString('emoji', true);
      const setting = findSetting('currency')!;
      setCurrency(guildId, { name, emoji });

      await interaction.reply(updatedReply(interaction, setting));
      return;
    }

    if (group === 'set' && sub === 'pat') {
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      const cooldown = interaction.options.getInteger('cooldown');
      const enabled = interaction.options.getBoolean('enabled');

      if (
        min === null &&
        max === null &&
        cooldown === null &&
        enabled === null
      ) {
        await interaction.reply({
          content:
            'give me something to change !! (min, max, cooldown, and/or enabled)',
        });
        return;
      }

      const current = getPatSettings(guildId);
      const nextMin = min ?? current.minReward;
      const nextMax = max ?? current.maxReward;
      if (nextMin > nextMax) {
        await interaction.reply({
          content: `min can't be bigger than max !! that would make the range ${nextMin.toLocaleString('en-US')}-${nextMax.toLocaleString('en-US')}`,
        });
        return;
      }

      const setting = findSetting('pat')!;
      setPatSettings(guildId, {
        ...(min !== null ? { minReward: min } : {}),
        ...(max !== null ? { maxReward: max } : {}),
        ...(cooldown !== null ? { cooldownSeconds: cooldown * 60 } : {}),
      });
      if (enabled !== null) setGameEnabled(guildId, 'pat', enabled);

      await interaction.reply(updatedReply(interaction, setting));
      return;
    }

    if (group === 'set' && sub === 'gambling') {
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      const enabled = interaction.options.getBoolean('enabled');

      if (min === null && max === null && enabled === null) {
        await interaction.reply({
          content: 'give me something to change !! (min, max, and/or enabled)',
        });
        return;
      }

      const current = getGamblingSettings(guildId);
      const nextMin = min ?? current.minBet;
      const nextMax = max ?? current.maxBet;
      if (nextMax > 0 && nextMin > nextMax) {
        await interaction.reply({
          content: `min can't be bigger than max !! that would make the range ${nextMin.toLocaleString('en-US')}-${nextMax.toLocaleString('en-US')}`,
        });
        return;
      }

      const setting = findSetting('gambling')!;
      setGamblingSettings(guildId, {
        ...(min !== null ? { minBet: min } : {}),
        ...(max !== null ? { maxBet: max } : {}),
      });
      if (enabled !== null) setGamblingEnabled(guildId, enabled);

      await interaction.reply(updatedReply(interaction, setting));
      return;
    }

    if (group === 'set' && sub === 'timezone') {
      const zone = interaction.options.getString('zone', true).trim();
      if (!isValidTimeZone(zone)) {
        await interaction.reply({
          content: `i don't know the timezone **${zone}**!! pick one from the list, like \`America/Chicago\``,
        });
        return;
      }

      const setting = findSetting('timezone')!;
      setGuildTimezone(guildId, zone);

      await interaction.reply(updatedReply(interaction, setting));
      return;
    }

    if (group === 'set' && sub === 'tickets') {
      const live = interaction.options.getChannel('category');
      const archive = interaction.options.getChannel('archive');

      if (!live && !archive) {
        await interaction.reply({
          content:
            'pick at least one ! **category** is where tickets open, **archive** is where closed ones go',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const setting = findSetting('tickets')!;
      if (live) setGuildSetting(guildId, TICKET_CATEGORY_KEY, live.id);
      if (archive) setGuildSetting(guildId, TICKET_ARCHIVE_KEY, archive.id);

      const notes: string[] = [];
      const me = interaction.guild.members.me;
      const missing = missingTicketPerms(interaction.guild);
      const unreachable = [live, archive]
        .filter((c) => c !== null)
        .filter(
          (c) =>
            me?.permissionsIn(c.id).has(PermissionFlagsBits.ManageChannels) !==
            true,
        )
        .map((c) => `<#${c.id}>`);

      if (missing.length > 0) {
        notes.push(
          `i'm missing **${missing.join('** and **')}**, so i can't make ticket channels at all until someone gives me that`,
        );
      }
      if (unreachable.length > 0) {
        notes.push(
          `i can't manage channels inside ${unreachable.join(' or ')},, check my permissions there`,
        );
      }

      await interaction.reply(updatedReply(interaction, setting, notes));
      return;
    }

    if (group === 'set' && sub === 'levels') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setLevelingEnabled(guildId, enabled);

      await interaction.reply(
        enabled
          ? settingsReply(interaction.guild, 'leveling is on !', [
              'members earn xp by chatting now c:',
            ])
          : settingsReply(interaction.guild, 'leveling is off', [
              'xp is kept safe, nobody earns any for now',
            ]),
      );
      return;
    }
  },
};
