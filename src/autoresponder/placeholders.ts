import type { GuildMember } from 'discord.js';

import { getBalance, getCurrency } from '../economy.js';
import { getItem, getQuantity, getInventory } from '../items.js';

import type { RenderContext } from './context.js';
import { resolveMemberArg } from './guards.js';

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

export const USER_TARGET_TAGS = new Set([
  'user',
  'user.name',
  'user.nickname',
  'user.id',
  'user.avatar',
  'user.joinedat',
  'user.createdat',
  'user.displaycolor',
  'user.boostsince',
  'user.balance',
  'user.inventory',
]);

async function memberOf(
  ctx: RenderContext,
  target: string | undefined,
): Promise<GuildMember> {
  const raw = (target ?? '').trim();
  if (raw.length === 0) return ctx.member;

  const member = await resolveMemberArg(ctx, raw);
  if (!member) throw new Error(`no member: ${raw}`);
  return member;
}

function balanceOf(ctx: RenderContext, userId: string): number {
  return (
    getBalance(ctx.guild.id, userId) + (ctx.pending?.balanceDelta(userId) ?? 0)
  );
}

function quantityOf(
  ctx: RenderContext,
  userId: string,
  itemKey: string,
): number {
  return (
    getQuantity(ctx.guild.id, userId, itemKey) +
    (ctx.pending?.itemDelta(userId, itemKey) ?? 0)
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
  ['user', async (ctx, args) => (await memberOf(ctx, args[0])).toString()],
  [
    'user.name',
    async (ctx, args) => (await memberOf(ctx, args[0])).user.username,
  ],
  [
    'user.nickname',
    async (ctx, args) => (await memberOf(ctx, args[0])).displayName,
  ],
  ['user.id', async (ctx, args) => (await memberOf(ctx, args[0])).id],
  [
    'user.avatar',
    async (ctx, args) => (await memberOf(ctx, args[0])).displayAvatarURL(),
  ],
  [
    'user.joinedat',
    async (ctx, args) => {
      const joined = (await memberOf(ctx, args[0])).joinedTimestamp;
      if (joined === null) throw new Error('no join date');
      return discordTimestamp(joined);
    },
  ],
  [
    'user.createdat',
    async (ctx, args) =>
      discordTimestamp((await memberOf(ctx, args[0])).user.createdTimestamp),
  ],
  [
    'user.displaycolor',
    async (ctx, args) => (await memberOf(ctx, args[0])).displayHexColor,
  ],
  [
    'user.boostsince',
    async (ctx, args) => {
      const since = (await memberOf(ctx, args[0])).premiumSinceTimestamp;
      return since ? discordTimestamp(since) : 'not a booster';
    },
  ],
  [
    'user.item',
    async (ctx, args) => {
      const name = (args[0] ?? '').trim();
      if (name.length === 0) throw new Error('item needs a name');

      const item = getItem(ctx.guild.id, name);
      if (!item) throw new Error(`no item: ${name}`);

      const member = await memberOf(ctx, args[1]);
      return itemLine(
        item.emoji,
        item.name,
        quantityOf(ctx, member.id, item.nameKey),
      );
    },
  ],
  [
    'user.inventory',
    async (ctx, args) => {
      const member = await memberOf(ctx, args[0]);
      let entries = getInventory(ctx.guild.id, member.id);

      const deltas = ctx.pending?.itemDeltas(member.id);
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
    async (ctx, args) => {
      const name = (args[0] ?? '').trim();
      if (name.length === 0) throw new Error('itemcount needs an item');

      const item = getItem(ctx.guild.id, name);
      if (!item) throw new Error(`no item: ${name}`);

      const member = await memberOf(ctx, args[1]);
      return quantityOf(ctx, member.id, item.nameKey).toLocaleString('en-US');
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
  [
    'user.balance',
    async (ctx, args) =>
      balanceOf(ctx, (await memberOf(ctx, args[0])).id).toLocaleString('en-US'),
  ],
  ['server.currency', (ctx) => getCurrency(ctx.guild.id).name],
  ['server.currencyemoji', (ctx) => getCurrency(ctx.guild.id).emoji],
]);
