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
const ROLE_MENTION = /^<@&(\d+)>$/;

function targetOf(raw: string, mention: RegExp, prefix: string): string {
  const match = mention.exec(raw);
  if (match) return match[1]!;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

export const guards = new Map<string, Guard>([
  [
    'requirebal',
    (meta, args) => {
      const amount = parseAmount(args[0] ?? '');
      if (amount === null || amount <= 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirebal} tag !',
        };
      }

      const balance = getBalance(meta.guildId, meta.userId);
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
    (meta, args) => {
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

      const have = getQuantity(meta.guildId, meta.userId, name);
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

      const target = targetOf(raw, CHANNEL_MENTION, '#');
      const lower = target.toLowerCase();
      const channel =
        (/^\d+$/.test(target) ? ctx.guild.channels.cache.get(target) : null) ??
        ctx.guild.channels.cache.find((c) => c.name.toLowerCase() === lower);

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
    'requirerole',
    (_meta, args, ctx) => {
      const raw = (args[0] ?? '').trim();
      if (raw.length === 0) {
        return {
          ok: false,
          message: 'this autoresponder has a broken {requirerole} tag !',
        };
      }

      const target = targetOf(raw, ROLE_MENTION, '@');
      const lower = target.toLowerCase();
      const role =
        (/^\d+$/.test(target) ? ctx.guild.roles.cache.get(target) : null) ??
        ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === lower);

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
]);
