import type { RenderContext } from './context.js';

export type Generator = (ctx: RenderContext, args: string[]) => string;

export const RANGE_FORMAT = /^(-?\d+)\s*-\s*(-?\d+)$/;

export const generators = new Map<string, Generator>([
  [
    'range',
    (_ctx, args) => {
      const match = RANGE_FORMAT.exec(args[0] ?? '');
      if (!match) throw new Error(`bad range: ${args[0] ?? ''}`);

      const a = Number(match[1]);
      const b = Number(match[2]);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);

      return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
    },
  ],
  [
    'choice',
    (_ctx, args) => {
      const options = args.filter((option) => option.length > 0);
      if (options.length === 0) throw new Error('choice needs options');

      return options[Math.floor(Math.random() * options.length)]!;
    },
  ],
]);
