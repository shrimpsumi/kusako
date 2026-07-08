import { db } from '../db.js';
import type { Node } from './ast.js';
import type { RenderContext, EvalMeta } from './context.js';
import { generators } from './generators.js';
import { placeholders } from './placeholders.js';
import { guards } from './guards.js';
import { effects, EffectError } from './effects.js';
import { getCooldownRemaining, setCooldown } from './cooldowns.js';
import {
  interpolateArgs,
  parseAmount,
  clampDuration,
  formatDuration,
} from './args.js';

export interface Segment {
  content: string;
  delaySeconds: number;
}

export interface MessageActions {
  reactions: string[];
  deleteTrigger: boolean;
  dm: boolean;
}

export type EvalResult =
  | { ok: true; segments: Segment[]; actions: MessageActions }
  | { ok: false; message: string };

export async function evaluate(
  nodes: Node[],
  ctx: RenderContext,
  triggerKey: string,
): Promise<EvalResult> {
  const meta: EvalMeta = {
    guildId: ctx.guild.id,
    userId: ctx.member.id,
    triggerKey,
  };

  const captures = new Map<string, string>();
  const segments: Segment[] = [];
  const queuedEffects: Array<{ name: string; args: string[] }> = [];
  let current = '';
  let currentDelay = 0;
  let cooldownSeconds: number | null = null;
  const actions: MessageActions = {
    reactions: [],
    deleteTrigger: false,
    dm: false,
  };

  const closeSegment = (nextDelay: number) => {
    segments.push({ content: current.trim(), delaySeconds: currentDelay });
    current = '';
    currentDelay = nextDelay;
  };

  for (const node of nodes) {
    if (node.kind === 'text') {
      current += node.value;
      continue;
    }

    if (node.kind === 'capture-ref') {
      current += captures.get(node.name) ?? node.raw;
      continue;
    }

    const args = interpolateArgs(node.args, captures);

    const generate = generators.get(node.name);
    if (generate) {
      try {
        captures.set(node.captureName ?? node.name, generate(ctx, args));
      } catch {
        current += node.raw;
      }
      continue;
    }

    if (node.name === 'split') {
      closeSegment(0);
      continue;
    }

    if (node.name === 'delay') {
      closeSegment(clampDuration(parseAmount(args[0] ?? '')));
      continue;
    }

    if (node.name === 'cooldown') {
      const seconds = clampDuration(parseAmount(args[0] ?? ''));
      if (seconds <= 0) continue;

      const remaining = getCooldownRemaining(
        meta.guildId,
        meta.triggerKey,
        meta.userId,
      );
      if (remaining > 0) {
        return {
          ok: false,
          message: `slow down !! you can do that again in ${formatDuration(remaining)} c:`,
        };
      }

      cooldownSeconds = seconds;
      continue;
    }

    if (node.name === 'react') {
      const emoji = (args[0] ?? '').trim();
      if (emoji.length > 0) actions.reactions.push(emoji);
      continue;
    }

    if (node.name === 'deletetrigger') {
      actions.deleteTrigger = true;
      continue;
    }

    if (node.name === 'dm') {
      actions.dm = true;
      continue;
    }

    const guard = guards.get(node.name);
    if (guard) {
      const result = guard(meta, args, ctx);
      if (!result.ok) return { ok: false, message: result.message };
      continue;
    }

    if (effects.has(node.name)) {
      queuedEffects.push({ name: node.name, args });
      continue;
    }

    const resolver = placeholders.get(node.name);
    if (!resolver) {
      current += node.raw;
      continue;
    }
    try {
      current += await resolver(ctx, args);
    } catch {
      current += node.raw;
    }
  }

  closeSegment(0);

  if (queuedEffects.length > 0 || cooldownSeconds !== null) {
    try {
      db().transaction(() => {
        for (const queued of queuedEffects) {
          effects.get(queued.name)!(meta, queued.args);
        }
        if (cooldownSeconds !== null) {
          setCooldown(
            meta.guildId,
            meta.triggerKey,
            meta.userId,
            cooldownSeconds,
          );
        }
      })();
    } catch (err) {
      if (err instanceof EffectError) {
        return { ok: false, message: err.message };
      }
      throw err;
    }
  }

  return { ok: true, segments, actions };
}
