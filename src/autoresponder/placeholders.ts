import { getBalance, getCurrency } from '../economy.js';
import { getItem, getQuantity, getInventory } from '../items.js';

import type { RenderContext } from './context.js';

export type Resolver = (
  ctx: RenderContext,
  args: string[],
) => string | Promise<string>;

function discordTimestamp(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n.toLocaleString('en-US')}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n.toLocaleString('en-US')}${suffix}`;
}

const INVENTORY_LINES = 15;

function balanceOf(ctx: RenderContext): number {
  return (
    getBalance(ctx.guild.id, ctx.member.id) +
    (ctx.pending?.balanceDelta(ctx.member.id) ?? 0)
  );
}

function quantityOf(ctx: RenderContext, itemKey: string): number {
  return (
    getQuantity(ctx.guild.id, ctx.member.id, itemKey) +
    (ctx.pending?.itemDelta(ctx.member.id, itemKey) ?? 0)
  );
}

function itemLine(
  emoji: string | null,
  name: string,
  quantity: number,
): string {
  return `${quantity.toLocaleString('en-US')} × ${emoji ?? '📦'} ${name}`;
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
  ['user.displaycolor', (ctx) => ctx.member.displayHexColor],
  [
    'user.boostsince',
    (ctx) => {
      const since = ctx.member.premiumSinceTimestamp;
      return since ? discordTimestamp(since) : 'not a booster';
    },
  ],
  [
    'user.item',
    (ctx, args) => {
      const name = (args[0] ?? '').trim();
      if (name.length === 0) throw new Error('item needs a name');

      const item = getItem(ctx.guild.id, name);
      if (!item) throw new Error(`no item: ${name}`);

      return itemLine(item.emoji, item.name, quantityOf(ctx, item.nameKey));
    },
  ],
  [
    'user.inventory',
    (ctx) => {
      let entries = getInventory(ctx.guild.id, ctx.member.id);

      const deltas = ctx.pending?.itemDeltas(ctx.member.id);
      if (deltas && deltas.size > 0) {
        const byKey = new Map(
          entries.map((entry) => [entry.item.nameKey, entry]),
        );
        for (const [itemKey, delta] of deltas) {
          const existing = byKey.get(itemKey);
          if (existing) {
            existing.quantity += delta;
          } else if (delta > 0) {
            const item = getItem(ctx.guild.id, itemKey);
            if (item) byKey.set(itemKey, { item, quantity: delta });
          }
        }
        entries = [...byKey.values()]
          .filter((entry) => entry.quantity > 0)
          .sort((a, b) => a.item.nameKey.localeCompare(b.item.nameKey));
      }

      if (entries.length === 0) return 'nothing yet...';

      const lines = entries
        .slice(0, INVENTORY_LINES)
        .map((entry) =>
          itemLine(entry.item.emoji, entry.item.name, entry.quantity),
        );
      if (entries.length > INVENTORY_LINES) {
        lines.push(`+ ${entries.length - INVENTORY_LINES} more...`);
      }
      return lines.join('\n');
    },
  ],
  [
    'user.itemcount',
    (ctx, args) => {
      const name = (args[0] ?? '').trim();
      if (name.length === 0) throw new Error('itemcount needs an item');

      const item = getItem(ctx.guild.id, name);
      if (!item) throw new Error(`no item: ${name}`);

      return quantityOf(ctx, item.nameKey).toLocaleString('en-US');
    },
  ],
  ['channel', (ctx) => ctx.channel.toString()],
  ['channel.name', (ctx) => ctx.channel.name],
  [
    'channel.createdat',
    (ctx) => {
      const created = ctx.channel.createdTimestamp;
      if (created === null) throw new Error('no channel create date');
      return discordTimestamp(created);
    },
  ],
  ['date', () => `<t:${Math.floor(Date.now() / 1000)}:f>`],
  ['server.name', (ctx) => ctx.guild.name],
  ['server.id', (ctx) => ctx.guild.id],
  ['server.owner', (ctx) => `<@${ctx.guild.ownerId}>`],
  ['server.owner.id', (ctx) => ctx.guild.ownerId],
  ['server.createdat', (ctx) => discordTimestamp(ctx.guild.createdTimestamp)],
  ['server.membercount.ordinal', (ctx) => ordinal(ctx.guild.memberCount)],
  ['server.rolecount', (ctx) => (ctx.guild.roles.cache.size - 1).toString()],
  ['server.channelcount', (ctx) => ctx.guild.channels.cache.size.toString()],
  ['server.boostlevel', (ctx) => ctx.guild.premiumTier.toString()],
  [
    'server.boostcount',
    (ctx) => (ctx.guild.premiumSubscriptionCount ?? 0).toString(),
  ],
  [
    'server.icon',
    (ctx) => {
      const icon = ctx.guild.iconURL();
      if (!icon) throw new Error('no server icon');
      return icon;
    },
  ],
  ['server.membercount', (ctx) => ctx.guild.memberCount.toString()],
  ['user.balance', (ctx) => balanceOf(ctx).toLocaleString('en-US')],
  ['server.currency', (ctx) => getCurrency(ctx.guild.id).name],
  ['server.currencyemoji', (ctx) => getCurrency(ctx.guild.id).emoji],
]);
