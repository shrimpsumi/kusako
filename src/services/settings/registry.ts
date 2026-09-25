import { channelMention } from 'discord.js';

import { getCurrency } from '../economy/guild.js';
import {
  getPatSettings,
  getGamblingSettings,
  isGameEnabled,
  isGamblingEnabled,
} from '../games/store.js';
import { isLevelingEnabled } from '../levels/store.js';
import { getEventReply } from '../guildEvents/store.js';
import { EVENTS } from '../guildEvents/registry.js';
import { getTicketCategories } from '../tickets/store.js';
import { formatDuration } from '../../dsl/args.js';
import {
  getGuildTimezone,
  hasGuildTimezone,
  zonedParts,
  formatWallTime,
} from '../timezone.js';

export interface SettingKnob {
  option: string;
  command: string;
  value(guildId: string): string;
}

export interface SettingEntry {
  id: string;
  group: string;
  label: string;
  knobs: SettingKnob[];
  render(guildId: string): string;
}

export interface SettingGroup {
  id: string;
  label: string;
  description: string;
  settings: SettingEntry[];
}

export const GROUPS: Omit<SettingGroup, 'settings'>[] = [
  {
    id: 'economy',
    label: 'economy',
    description:
      "your server's currency, the commands that earn it like /pat, and gambling",
  },
  {
    id: 'leveling',
    label: 'leveling',
    description: 'whether members earn xp by chatting',
  },
  {
    id: 'events',
    label: 'events',
    description:
      'what sako says when someone joins, leaves, boosts or has a birthday',
  },
  {
    id: 'tickets',
    label: 'tickets',
    description: 'where ticket channels open and where closed ones go',
  },
  {
    id: 'schedule',
    label: 'scheduled posts',
    description: 'the timezone sako uses when she posts on a schedule',
  },
];

const n = (value: number) => value.toLocaleString('en-US');
const onOff = (enabled: boolean) => (enabled ? 'on' : 'off');

function money(guildId: string, value: number): string {
  return `${getCurrency(guildId).emoji} ${n(value)}`;
}

function localTime(zone: string): string {
  const now = zonedParts(Date.now(), zone);
  return formatWallTime(now.hour * 60 + now.minute);
}

export const SETTINGS: SettingEntry[] = [
  {
    id: 'currency',
    group: 'economy',
    label: 'currency',
    knobs: [
      {
        option: 'name',
        command: '/settings set currency',
        value: (guildId) => getCurrency(guildId).name,
      },
      {
        option: 'emoji',
        command: '/settings set currency',
        value: (guildId) => getCurrency(guildId).emoji,
      },
    ],
    render(guildId) {
      const currency = getCurrency(guildId);
      return `${currency.emoji} ${currency.name}`;
    },
  },
  {
    id: 'pat',
    group: 'economy',
    label: 'head pats',
    knobs: [
      {
        option: 'min',
        command: '/settings set pat',
        value: (guildId) => n(getPatSettings(guildId).minReward),
      },
      {
        option: 'max',
        command: '/settings set pat',
        value: (guildId) => n(getPatSettings(guildId).maxReward),
      },
      {
        option: 'cooldown',
        command: '/settings set pat',
        value: (guildId) =>
          formatDuration(getPatSettings(guildId).cooldownSeconds),
      },
      {
        option: 'enabled',
        command: '/settings set pat',
        value: (guildId) => onOff(isGameEnabled(guildId, 'pat')),
      },
    ],
    render(guildId) {
      if (!isGameEnabled(guildId, 'pat')) return 'off';

      const pat = getPatSettings(guildId);
      const currency = getCurrency(guildId);
      return `on · ${currency.emoji} ${n(pat.minReward)}-${n(pat.maxReward)} per pat · every ${formatDuration(pat.cooldownSeconds)}`;
    },
  },
  {
    id: 'gambling',
    group: 'economy',
    label: 'gambling',
    knobs: [
      {
        option: 'min',
        command: '/settings set gambling',
        value: (guildId) => n(getGamblingSettings(guildId).minBet),
      },
      {
        option: 'max',
        command: '/settings set gambling',
        value: (guildId) => {
          const { maxBet } = getGamblingSettings(guildId);
          return maxBet === 0 ? 'no limit' : n(maxBet);
        },
      },
      {
        option: 'enabled',
        command: '/settings set gambling',
        value: (guildId) => onOff(isGamblingEnabled(guildId)),
      },
    ],
    render(guildId) {
      if (!isGamblingEnabled(guildId)) return 'off';

      const { minBet, maxBet } = getGamblingSettings(guildId);
      const max = maxBet === 0 ? 'no max' : `max ${money(guildId, maxBet)}`;
      return `on · bets from ${money(guildId, minBet)} · ${max}`;
    },
  },
  {
    id: 'levels',
    group: 'leveling',
    label: 'xp earning',
    knobs: [
      {
        option: 'enabled',
        command: '/settings set levels',
        value: (guildId) => onOff(isLevelingEnabled(guildId)),
      },
    ],
    render(guildId) {
      return onOff(isLevelingEnabled(guildId));
    },
  },
  ...EVENTS.map(
    (event): SettingEntry => ({
      id: `event:${event.id}`,
      group: 'events',
      label: event.label,
      knobs: [
        {
          option: 'reply',
          command: '/events set',
          value: (guildId) =>
            getEventReply(guildId, event.id)?.response ? 'set' : 'not set',
        },
        {
          option: 'channel',
          command: '/events channel',
          value: (guildId) => {
            const channelId = getEventReply(guildId, event.id)?.channelId;
            return channelId ? channelMention(channelId) : 'not set';
          },
        },
      ],
      render(guildId) {
        const reply = getEventReply(guildId, event.id);
        return [
          reply?.response ? 'reply set' : 'no reply yet',
          reply?.channelId
            ? `goes to ${channelMention(reply.channelId)}`
            : 'no channel',
        ].join(' · ');
      },
    }),
  ),
  {
    id: 'tickets',
    group: 'tickets',
    label: 'categories',
    knobs: [
      {
        option: 'category',
        command: '/settings set tickets',
        value: (guildId) => {
          const { live } = getTicketCategories(guildId);
          return live ? channelMention(live) : 'not set';
        },
      },
      {
        option: 'archive',
        command: '/settings set tickets',
        value: (guildId) => {
          const { archive } = getTicketCategories(guildId);
          return archive ? channelMention(archive) : 'not set';
        },
      },
    ],
    render(guildId) {
      const { live, archive } = getTicketCategories(guildId);
      return [
        live ? `open in ${channelMention(live)}` : 'no category yet',
        archive ? `archive in ${channelMention(archive)}` : 'no archive yet',
      ].join(' · ');
    },
  },
  {
    id: 'timezone',
    group: 'schedule',
    label: 'timezone',
    knobs: [
      {
        option: 'zone',
        command: '/settings set timezone',
        value: (guildId) => {
          if (!hasGuildTimezone(guildId)) return 'not set';
          const zone = getGuildTimezone(guildId);
          return `${zone} (it's ${localTime(zone)} there)`;
        },
      },
    ],
    render(guildId) {
      if (!hasGuildTimezone(guildId)) return 'not set yet';

      const zone = getGuildTimezone(guildId);
      return `${zone} · it's ${localTime(zone)} there`;
    },
  },
];

export function groups(): SettingGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    settings: SETTINGS.filter((setting) => setting.group === group.id),
  }));
}

export function findGroup(id: string): SettingGroup | null {
  return groups().find((group) => group.id === id) ?? null;
}

export function findSetting(id: string): SettingEntry | null {
  return SETTINGS.find((setting) => setting.id === id) ?? null;
}
