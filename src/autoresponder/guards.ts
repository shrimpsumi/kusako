import { getBalance, getCurrency } from '../economy.js';
import { getItem, getQuantity } from '../items.js';
import type { EvalMeta, RenderContext } from './context.js';
import { parseAmount } from './args.js';

export type GuardResult = { ok: true } | { ok: false; message: string };
export type Guard = (
  meta: EvalMeta,
  args: string[],
  ctx: RenderContext,
) => GuardResult;

const CHANNEL_MENTION = /^<#(\d+)>$/;
const ROLE_MENTION = /^<@&?(\d+)>$/;
const USER_MENTION = /^<@!?(\d+)>$/;

function targetOf(raw: string, mention: RegExp, prefix: string): string {
  const match = mention.exec(raw);
  if (match) return match[1]!;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

export function resolveChannelArg(ctx: RenderContext, raw: string) {
  const target = targetOf(raw.trim(), CHANNEL_MENTION, '#');
  if (target.length === 0) return null;

  const lower = target.toLowerCase();
  return (
    (/^\d+$/.test(target) ? ctx.guild.channels.cache.get(target) : null) ??
    ctx.guild.channels.cache.find((c) => c.name.toLowerCase() === lower) ??
    null
  );
}

export function resolveRoleArg(ctx: RenderContext, raw: string) {
  const target = targetOf(raw.trim(), ROLE_MENTION, '@');
  if (target.length === 0) return null;

  const lower = target.toLowerCase();
  return (
    (/^\d+$/.test(target) ? ctx.guild.roles.cache.get(target) : null) ??
    ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ??
    null
  );
}

export function userIdOf(raw: string): string | null {
  const target = targetOf(raw.trim(), USER_MENTION, '@');
  return /^\d+$/.test(target) ? target : null;
}

export const guards = new Map<string, Guard>([
  [
    'requirebal',
    (meta, args, ctx) => {
      const amount = parseAmount(args[0] ?? '');
      if (amount === null || amount <= 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirebal} tag !',
        };
      }

      const balance =
        getBalance(meta.guildId, meta.userId) +
        (ctx.pending?.balanceDelta(meta.userId) ?? 0);
      if (balance >= amount) return { ok: true };

      const currency = getCurrency(meta.guildId);
      return {
        ok: false,
        message: `you need ${currency.emoji} **${amount.toLocaleString('en-US')} ${currency.name}** to do that ! you only have ${balance.toLocaleString('en-US')} !`,
      };
    },
  ],
  [
    'requireitem',
    (meta, args, ctx) => {
      const name = args[0] ?? '';
      const quantity = args.length > 1 ? parseAmount(args[1] ?? '') : 1;
      if (name.length === 0 || quantity === null || quantity <= 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requireitem} tag !',
        };
      }

      const item = getItem(meta.guildId, name);
      if (!item) {
        return {
          ok: false,
          message: "that needs an item that doesn't exist anymore...",
        };
      }

      const have =
        getQuantity(meta.guildId, meta.userId, name) +
        (ctx.pending?.itemDelta(meta.userId, item.nameKey) ?? 0);
      if (have >= quantity) return { ok: true };

      return {
        ok: false,
        message: `you need ${quantity}× ${item.emoji ?? '📦'} **${item.name}** to do that !`,
      };
    },
  ],
  [
    'requirechannel',
    (_meta, args, ctx) => {
      const raw = (args[0] ?? '').trim();
      if (raw.length === 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirechannel} tag !',
        };
      }

      const channel = resolveChannelArg(ctx, raw);
      if (!channel) {
        return {
          ok: false,
          message: "that needs a channel that doesn't exist anymore...",
        };
      }

      if (ctx.channel.id === channel.id) return { ok: true };

      return {
        ok: false,
        message: `that only works in ${channel.toString()} !`,
      };
    },
  ],
  [
    'denychannel',
    (_meta, args, ctx) => {
      const channel = resolveChannelArg(ctx, args[0] ?? '');
      if (channel && ctx.channel.id === channel.id) {
        return {
          ok: false,
          message: `that doesn't work in ${channel.toString()} !`,
        };
      }
      return { ok: true };
    },
  ],
  [
    'requirerole',
    (_meta, args, ctx) => {
      const raw = (args[0] ?? '').trim();
      if (raw.length === 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirerole} tag !',
        };
      }

      const role = resolveRoleArg(ctx, raw);
      if (!role) {
        return {
          ok: false,
          message: "that needs a role that doesn't exist anymore...",
        };
      }

      if (ctx.member.roles.cache.has(role.id)) return { ok: true };

      return {
        ok: false,
        message: `you need the **${role.name}** role to do that !`,
      };
    },
  ],
  [
    'denyrole',
    (_meta, args, ctx) => {
      const role = resolveRoleArg(ctx, args[0] ?? '');
      if (role && ctx.member.roles.cache.has(role.id)) {
        return {
          ok: false,
          message: `the **${role.name}** role can't use this one !`,
        };
      }
      return { ok: true };
    },
  ],
  [
    'requireuser',
    (meta, args) => {
      const id = userIdOf(args[0] ?? '');
      if (!id) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requireuser} tag !',
        };
      }

      if (meta.userId === id) return { ok: true };

      return { ok: false, message: "this one isn't for you c:" };
    },
  ],
  [
    'requirearg',
    (_meta, args, ctx) => {
      const needed = parseAmount(args[0] ?? '');
      if (needed === null || needed <= 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirearg} tag !',
        };
      }

      const have = ctx.messageArgs?.length ?? 0;
      if (have >= needed) return { ok: true };

      return {
        ok: false,
        message: `that needs at least ${needed} word${needed === 1 ? '' : 's'} with it ! (you gave ${have})`,
      };
    },
  ],
  [
    'denyuser',
    (meta, args) => {
      const id = userIdOf(args[0] ?? '');
      if (id && meta.userId === id) {
        return { ok: false, message: "this one isn't for you c:" };
      }
      return { ok: true };
    },
  ],
]);
