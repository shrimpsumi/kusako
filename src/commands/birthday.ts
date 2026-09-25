import { SlashCommandBuilder } from 'discord.js';

import type { SlashCommand } from '../client.js';
import { parseBirthday } from '../services/birthdays/dates.js';
import {
  setBirthday,
  getBirthday,
  removeBirthday,
  upcomingBirthdays,
  countBirthdays,
  sortKey,
} from '../services/birthdays/store.js';
import { getEventReply } from '../services/guildEvents/store.js';
import {
  isValidTimeZone,
  timeZoneChoices,
  getGuildTimezone,
  zonedParts,
} from '../services/timezone.js';
import { formatBirthday } from '../utils/format.js';
import { commandMention } from '../utils/commandMentions.js';
import { serverEmbed, userEmbed, NO_DMS } from '../utils/style.js';

const UPCOMING = 10;

const DATE_HELP =
  "that date didn't look right! use `YYYY-MM-DD` or just `MM-DD`, like `2003-01-15` or `01-15`";

function setupNote(guildId: string): string | null {
  const reply = getEventReply(guildId, 'birthday');
  if (reply?.response && reply.channelId) return null;

  return `-# this server hasn't set its birthday message up yet, so nothing will send. an admin can set it up with ${commandMention('/events set')}`;
}

export const birthday: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('tell sako when your birthday is !')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('set your birthday')
        .addStringOption((o) =>
          o
            .setName('date')
            .setDescription('YYYY-MM-DD or MM-DD, e.g. 2003-01-15 or 01-15')
            .setMaxLength(10)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('timezone')
            .setDescription("your timezone, so it's sent at your midnight")
            .setAutocomplete(true)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('remove your birthday'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('see when a birthday is')
        .addUserOption((o) =>
          o
            .setName('user')
            .setDescription('whose? defaults to you')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('the next birthdays coming up'),
    ) as SlashCommandBuilder,

  async autocomplete(interaction) {
    await interaction.respond(
      timeZoneChoices(interaction.options.getFocused()),
    );
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: NO_DMS });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const date = parseBirthday(interaction.options.getString('date', true));
      if (date === null) {
        await interaction.reply({ content: DATE_HELP });
        return;
      }

      const zone = interaction.options.getString('timezone');
      if (zone !== null && !isValidTimeZone(zone)) {
        await interaction.reply({
          content: `i don't know the timezone \`${zone}\`! pick one from the list as you type`,
        });
        return;
      }

      setBirthday(guildId, interaction.user.id, date, zone);

      const lines = [
        `got it, your birthday is **${formatBirthday(date.month, date.day)}** !`,
        zone === null
          ? `-# using the server's timezone,, set your own with the \`timezone\` option`
          : `-# at midnight in **${zone}**`,
      ];

      const note = setupNote(guildId);
      if (note) lines.push(note);

      const embed = userEmbed(interaction.user)
        .setTitle('birthday saved !')
        .setDescription(lines.join('\n'));

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'remove') {
      const had = removeBirthday(guildId, interaction.user.id);
      await interaction.reply({
        content: had
          ? 'removed your birthday !'
          : "you don't have a birthday saved here !",
      });
      return;
    }

    if (sub === 'show') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const saved = getBirthday(guildId, target.id);
      const self = target.id === interaction.user.id;

      if (!saved) {
        await interaction.reply({
          content: self
            ? `you haven't saved a birthday here yet ! ${commandMention('/birthday set')}`
            : `${target.displayName} hasn't saved a birthday here !`,
        });
        return;
      }

      const embed = userEmbed(target)
        .setTitle('birthday !')
        .setDescription(
          `${self ? 'yours is' : `${target.displayName}'s is`} **${formatBirthday(saved.month, saved.day)}**`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    const total = countBirthdays(guildId);
    if (total === 0) {
      await interaction.reply({
        content: `nobody's saved a birthday here yet! be the first with ${commandMention('/birthday set')}`,
      });
      return;
    }

    const today = zonedParts(Date.now(), getGuildTimezone(guildId));
    const todayKey = sortKey(today.month, today.day);
    const upcoming = upcomingBirthdays(guildId, today, UPCOMING);

    const blocks = upcoming.map((entry) => {
      const when = formatBirthday(entry.month, entry.day);
      const isToday = sortKey(entry.month, entry.day) === todayKey;
      return `<@${entry.userId}>\n-# ${when}${isToday ? ' :: today !!' : ''}`;
    });

    const hint = `<:arrowright:1545483910022959194> add yours with ${commandMention('/birthday set')} !`;

    const embed = serverEmbed(interaction.guild)
      .setTitle('upcoming birthdays !')
      .setColor(0xc49f5f)
      .setDescription([blocks.join('\n'), '', hint].join('\n'));

    await interaction.reply({ embeds: [embed] });
  },
};
