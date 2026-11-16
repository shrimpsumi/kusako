import type { Guild } from 'discord.js';

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n.toLocaleString('en-US')}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n.toLocaleString('en-US')}${suffix}`;
}

export function formatBirthday(month: number, day: number): string {
  const name = MONTH_NAMES[month - 1] ?? '';
  return `${name} ${ordinal(day)}`.trim();
}

export function formatSeconds(seconds: number): string {
  const units: Array<[number, string]> = [
    [604_800, 'w'],
    [86_400, 'd'],
    [3600, 'h'],
    [60, 'm'],
    [1, 's'],
  ];

  let left = seconds;
  const parts: string[] = [];
  for (const [size, label] of units) {
    const n = Math.floor(left / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      left -= n * size;
    }
  }

  return parts.length > 0 ? parts.join(' ') : `${seconds}s`;
}

export function previewText(text: string, max = 44): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function channelChoiceLabel(
  guild: Guild,
  channelId: string,
  text: string,
): string {
  const name = guild.channels.cache.get(channelId)?.name;
  const where = name ? `#${name}` : 'deleted channel';
  const label = `${where} · ${text}`;
  return label.length > 100 ? `${label.slice(0, 99)}…` : label;
}
