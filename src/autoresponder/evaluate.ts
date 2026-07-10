import type { APIEmbed } from 'discord.js';

import { db } from '../db.js';
import {
  getEmbed,
  isRenderable,
  parseColor,
  EMBED_LIMITS,
  URLISH,
  type EmbedData,
} from '../embeds.js';
import { colors } from '../style.js';
import type { Node } from './ast.js';
import { parse } from './parser.js';
import type { RenderContext, EvalMeta } from './context.js';
import { generators } from './generators.js';
import { placeholders } from './placeholders.js';
import { guards, resolveChannelArg, resolveRoleArg } from './guards.js';
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
  embeds: APIEmbed[];
}

export interface MessageActions {
  reactions: string[];
  replyReactions: string[];
  deleteTrigger: boolean;
  dm: boolean;
  sendToChannelId: string | null;
  giveRoleIds: string[];
  takeRoleIds: string[];
}

export type EvalResult =
  | { ok: true; segments: Segment[]; actions: MessageActions }
  | { ok: false; message: string; silent: boolean };

async function renderInline(
  template: string,
  ctx: RenderContext,
  captures: Map<string, string>,
): Promise<string> {
  let out = '';
  for (const node of parse(template)) {
    if (node.kind === 'text') {
      out += node.value;
      continue;
    }
    if (node.kind === 'capture-ref') {
      out += captures.get(node.name) ?? node.raw;
      continue;
    }

    const resolver = placeholders.get(node.name);
    if (!resolver) {
      out += node.raw;
      continue;
    }
    try {
      out += await resolver(ctx, interpolateArgs(node.args, captures));
    } catch {
      out += node.raw;
    }
  }
  return out;
}

async function renderEmbed(
  data: EmbedData,
  ctx: RenderContext,
  captures: Map<string, string>,
): Promise<APIEmbed> {
  const render = async (value: string | undefined, max: number) => {
    if (value === undefined) return undefined;
    const rendered = (await renderInline(value, ctx, captures))
      .trim()
      .slice(0, max);
    return rendered.length > 0 ? rendered : undefined;
  };
  const renderUrl = async (value: string | undefined) => {
    const rendered = await render(value, EMBED_LIMITS.url);
    return rendered !== undefined && URLISH.test(rendered)
      ? rendered
      : undefined;
  };

  const out: APIEmbed = {};

  const title = await render(data.title, EMBED_LIMITS.title);
  if (title) out.title = title;
  const description = await render(data.description, EMBED_LIMITS.description);
  if (description) out.description = description;
  const url = await renderUrl(data.url);
  if (url) out.url = url;
  if (data.color !== undefined) out.color = data.color;
  if (data.timestamp) out.timestamp = data.timestamp;

  if (data.author) {
    const name = await render(data.author.name, EMBED_LIMITS.authorName);
    if (name) {
      out.author = { name };
      const icon = await renderUrl(data.author.icon_url);
      if (icon) out.author.icon_url = icon;
      const link = await renderUrl(data.author.url);
      if (link) out.author.url = link;
    }
  }

  if (data.footer) {
    const text = await render(data.footer.text, EMBED_LIMITS.footerText);
    if (text) {
      out.footer = { text };
      const icon = await renderUrl(data.footer.icon_url);
      if (icon) out.footer.icon_url = icon;
    }
  }

  const image = await renderUrl(data.image?.url);
  if (image) out.image = { url: image };
  const thumbnail = await renderUrl(data.thumbnail?.url);
  if (thumbnail) out.thumbnail = { url: thumbnail };

  if (data.fields && data.fields.length > 0) {
    const fields = [];
    for (const field of data.fields.slice(0, EMBED_LIMITS.fields)) {
      const name = await render(field.name, EMBED_LIMITS.fieldName);
      const value = await render(field.value, EMBED_LIMITS.fieldValue);
      if (name && value) {
        fields.push({ name, value, inline: field.inline === true });
      }
    }
    if (fields.length > 0) out.fields = fields;
  }

  return out;
}

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
  const captureIndices = new Map<string, number>();
  const words = ctx.messageArgs ?? [];
  words.forEach((word, i) => {
    captures.set(`$${i + 1}`, word);
    captures.set(`$${i + 1}+`, words.slice(i).join(' '));
  });
  const segments: Segment[] = [];
  const queuedEffects: Array<{ name: string; args: string[] }> = [];
  let current = '';
  let currentDelay = 0;
  let cooldownSeconds: number | null = null;
  const actions: MessageActions = {
    reactions: [],
    replyReactions: [],
    deleteTrigger: false,
    dm: false,
    sendToChannelId: null,
    giveRoleIds: [],
    takeRoleIds: [],
  };

  const silent = nodes.some(
    (node) => node.kind === 'placeholder' && node.name === 'silent',
  );

  let currentEmbeds: APIEmbed[] = [];
  let wrapCurrent = false;
  let wrapColor: number | null = null;

  const closeSegment = (nextDelay: number) => {
    let content = current.trim();
    const embeds = currentEmbeds;

    if (wrapCurrent && content.length > 0) {
      embeds.unshift({
        description: content.slice(0, EMBED_LIMITS.description),
        color: wrapColor ?? colors.cream,
      });
      content = '';
    }

    segments.push({ content, delaySeconds: currentDelay, embeds });
    current = '';
    currentDelay = nextDelay;
    currentEmbeds = [];
    wrapCurrent = false;
    wrapColor = null;
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
        const result = generate(ctx, args, captureIndices);
        const name = node.captureName ?? node.name;
        captures.set(name, result.value);
        if (result.index !== undefined) captureIndices.set(name, result.index);
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
          silent,
        };
      }

      cooldownSeconds = seconds;
      continue;
    }

    if (node.name === 'embed') {
      const name = (args[0] ?? '').trim();

      if (name.length === 0) {
        wrapCurrent = true;
        continue;
      }

      if (name.startsWith('#')) {
        const color = parseColor(name);
        if (color === null) {
          current += node.raw;
          continue;
        }
        wrapCurrent = true;
        wrapColor = color;
        continue;
      }

      const record = getEmbed(meta.guildId, name);
      if (!record || !isRenderable(record.data)) {
        current += node.raw;
        continue;
      }

      const rendered = await renderEmbed(record.data, ctx, captures);
      if (Object.keys(rendered).length === 0) {
        current += node.raw;
        continue;
      }

      currentEmbeds.push(rendered);
      continue;
    }

    if (node.name === 'react') {
      const emoji = (args[0] ?? '').trim();
      if (emoji.length > 0) actions.reactions.push(emoji);
      continue;
    }

    if (node.name === 'reactreply') {
      const emoji = (args[0] ?? '').trim();
      if (emoji.length > 0) actions.replyReactions.push(emoji);
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

    if (node.name === 'silent') {
      continue;
    }

    if (node.name === 'send') {
      const channel = resolveChannelArg(ctx, args[0] ?? '');
      if (channel && channel.isTextBased()) {
        actions.sendToChannelId = channel.id;
      }
      continue;
    }

    if (node.name === 'giverole' || node.name === 'takerole') {
      const role = resolveRoleArg(ctx, args[0] ?? '');
      if (!role) {
        current += node.raw;
        continue;
      }
      (node.name === 'giverole'
        ? actions.giveRoleIds
        : actions.takeRoleIds
      ).push(role.id);
      continue;
    }

    const guard = guards.get(node.name);
    if (guard) {
      const result = guard(meta, args, ctx);
      if (!result.ok) {
        return { ok: false, message: result.message, silent };
      }
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
        return { ok: false, message: err.message, silent };
      }
      throw err;
    }
  }

  return { ok: true, segments, actions };
}
