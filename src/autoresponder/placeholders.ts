import { getBalance, getCurrency } from '../economy.js';
import { getItem, getQuantity } from '../items.js';

import type { RenderContext } from './context.js';

export type Resolver = (
  ctx: RenderContext,
  args: string[],
) => string | Promise<string>;

function discordTimestamp(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

export const placeholders = new Map<string, Resolver>([
  ['newline', () => '\n'],
  ['user', (ctx) => ctx.member.toString()],
  ['user.name', (ctx) => ctx.member.user.username],
  ['user.nickname', (ctx) => ctx.member.displayName],
  ['user.id', (ctx) => ctx.member.id],
  ['user.avatar', (ctx) => ctx.member.displayAvatarURL()],
  [
    'user.joinedat',
    (ctx) => {
      const joined = ctx.member.joinedTimestamp;
      if (joined === null) throw new Error('no join date');
      return discordTimestamp(joined);
    },
  ],
  [
    'user.createdat',
    (ctx) => discordTimestamp(ctx.member.user.createdTimestamp),
  ],
  [
    'user.itemcount',
    (ctx, args) => {
      const name = (args[0] ?? '').trim();
      if (name.length === 0) throw new Error('itemcount needs an item');

      const item = getItem(ctx.guild.id, name);
      if (!item) throw new Error(`no item: ${name}`);

      return getQuantity(ctx.guild.id, ctx.member.id, name).toLocaleString(
        'en-US',
      );
    },
  ],
  ['channel', (ctx) => ctx.channel.toString()],
  ['channel.name', (ctx) => ctx.channel.name],
  ['server.name', (ctx) => ctx.guild.name],
  ['server.id', (ctx) => ctx.guild.id],
  [
    'server.icon',
    (ctx) => {
      const icon = ctx.guild.iconURL();
      if (!icon) throw new Error('no server icon');
      return icon;
    },
  ],
  ['server.membercount', (ctx) => ctx.guild.memberCount.toString()],
  [
    'user.balance',
    (ctx) => getBalance(ctx.guild.id, ctx.member.id).toLocaleString('en-US'),
  ],
  ['server.currency', (ctx) => getCurrency(ctx.guild.id).name],
  ['server.currencyemoji', (ctx) => getCurrency(ctx.guild.id).emoji],
]);
