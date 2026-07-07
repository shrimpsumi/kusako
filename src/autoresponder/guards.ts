import { getBalance, getCurrency } from '../economy.js';
import { getItem, getQuantity } from '../items.js';
import type { EvalMeta } from './context.js';
import { parseAmount } from './args.js';

export type GuardResult = { ok: true } | { ok: false; message: string };
export type Guard = (meta: EvalMeta, args: string[]) => GuardResult;

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
]);
