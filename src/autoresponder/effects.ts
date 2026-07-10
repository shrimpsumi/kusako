import { getCurrency, modifyBalance } from '../economy.js';
import { getItem, modifyInventory } from '../items.js';
import type { EvalMeta } from './context.js';
import { parseAmount } from './args.js';

export class EffectError extends Error {}

export type Effect = (meta: EvalMeta, args: string[]) => void;

export const effects = new Map<string, Effect>([
  [
    'modifybal',
    (meta, args) => {
      const amount = parseAmount(args[0] ?? '');
      if (amount === null) {
        throw new EffectError(
          'this autoresponder has a broken {modifybal} tag !',
        );
      }
      if (amount === 0) return;

      const result = modifyBalance(
        meta.guildId,
        meta.userId,
        amount,
        `autoresponder ${meta.triggerKey}`,
      );

      if (!result.ok) {
        const currency = getCurrency(meta.guildId);
        throw new EffectError(
          `you don't have enough ${currency.emoji} ${currency.name} for that !`,
        );
      }
    },
  ],
  [
    'modifyinv',
    (meta, args) => {
      const name = args[0] ?? '';
      const delta = parseAmount(args[1] ?? '');
      if (name.length === 0 || delta === null) {
        throw new EffectError(
          'this autoresponder has a broken {modifyinv} tag !',
        );
      }
      if (delta === 0) return;

      const item = getItem(meta.guildId, name);
      if (!item) {
        throw new EffectError(
          "that needs an item that doesn't exist anymore...",
        );
      }

      const result = modifyInventory(meta.guildId, meta.userId, name, delta);
      if (!result.ok) {
        throw new EffectError(
          `you don't have enough ${item.emoji ?? '📦'} **${item.name}** for that !`,
        );
      }
    },
  ],
]);
