import type { Node } from './ast.js';
import { generators, RANGE_FORMAT } from './generators.js';
import { parseAmount, DYNAMIC_ARG, YEAR_SECONDS } from './args.js';

const MAX_SEGMENTS = 3;
const MAX_REACTIONS = 3;
const MAX_EMBEDS = 3;

function checkDuration(
  arg: string | undefined,
  tag: string,
  min: number,
  errors: string[],
): void {
  const value = arg ?? '';
  if (DYNAMIC_ARG.test(value.trim())) return;

  const seconds = parseAmount(value);
  if (seconds === null || seconds < min || seconds > YEAR_SECONDS) {
    errors.push(
      `{${tag}} needs seconds between ${min} and ${YEAR_SECONDS.toLocaleString('en-US')} (or a [capture]), like {${tag}:540}`,
    );
  }
}

function checkAmount(
  arg: string | undefined,
  tag: string,
  allowNegative: boolean,
  errors: string[],
): void {
  const value = arg ?? '';
  if (DYNAMIC_ARG.test(value.trim())) return;

  const amount = parseAmount(value);
  const bad = amount === null || amount === 0 || (!allowNegative && amount < 0);
  if (bad) {
    errors.push(
      `{${tag}} needs a ${allowNegative ? 'non-zero' : 'positive'} whole number (or a [capture])`,
    );
  }
}

export function validateTemplate(nodes: Node[]): string[] {
  const errors: string[] = [];
  const bound = new Set<string>();
  let boundaries = 0;
  let cooldowns = 0;
  let reactions = 0;
  let embedTags = 0;

  for (const node of nodes) {
    if (node.kind === 'capture-ref') {
      if (!bound.has(node.name)) {
        errors.push(
          `[${node.name}] has nothing creating it before that point. add a tag like {range as ${node.name}: 10-100} first !`,
        );
      }
      continue;
    }

    if (node.kind !== 'placeholder') continue;

    if (generators.has(node.name)) {
      const captureName = node.captureName ?? node.name;

      if (bound.has(captureName)) {
        errors.push(
          `two tags both create [${captureName}]. give one its own name with "as", like {${node.name} as something: ...}`,
        );
      }
      bound.add(captureName);

      if (node.name === 'range' && !RANGE_FORMAT.test(node.args[0] ?? '')) {
        errors.push(
          /\sas\s+\w+/i.test(node.args[0] ?? '')
            ? `"as" goes before the colon ! write {range as name: 10-100}, not {range:10-100 as name}`
            : `{range} needs a number span, like {range:10-100}`,
        );
      }
      if (
        node.name === 'choice' &&
        node.args.filter((option) => option.length > 0).length < 2
      ) {
        errors.push(`{choice} needs at least two options split by |`);
      }
      continue;
    }

    if (node.captureName) {
      errors.push(
        `"as ${node.captureName}" doesn't work on {${node.name}}. "as" is only for tags that create a value, like {range} and {choice} !`,
      );
      continue;
    }

    if (node.name === 'split' || node.name === 'delay') {
      boundaries += 1;
      if (node.name === 'delay') {
        checkDuration(node.args[0], 'delay', 0, errors);
      }
      continue;
    }

    if (node.name === 'cooldown') {
      cooldowns += 1;
      if (cooldowns === 2) {
        errors.push('only one {cooldown} per autoresponder !');
      }
      checkDuration(node.args[0], 'cooldown', 1, errors);
      continue;
    }

    if (node.name === 'requirebal') {
      checkAmount(node.args[0], 'requirebal', false, errors);
      continue;
    }

    if (node.name === 'requireitem') {
      if ((node.args[0] ?? '').length === 0) {
        errors.push(
          '{requireitem} needs an item name, like {requireitem:shop pass} or {requireitem:milk|3}',
        );
      }
      if (node.args.length > 1) {
        checkAmount(node.args[1], 'requireitem', false, errors);
      }
      continue;
    }

    if (node.name === 'requirechannel') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{requirechannel} needs a channel, like {requirechannel:#bot-spam} or a channel id',
        );
      }
      continue;
    }

    if (node.name === 'requirerole') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{requirerole} needs a role, like {requirerole:@fisher} or a role id',
        );
      }
      continue;
    }

    if (node.name === 'react') {
      reactions += 1;
      if (reactions === MAX_REACTIONS + 1) {
        errors.push(`max ${MAX_REACTIONS} {react} tags per autoresponder !`);
      }
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push('{react} needs an emoji, like {react:🔥}');
      }
      continue;
    }

    if (node.name === 'embed') {
      embedTags += 1;
      if (embedTags === MAX_EMBEDS + 1) {
        errors.push(`max ${MAX_EMBEDS} {embed} tags per autoresponder !`);
      }
      continue;
    }

    if (node.name === 'user.itemcount') {
      if ((node.args[0] ?? '').trim().length === 0) {
        errors.push(
          '{user.itemcount} needs an item name, like {user.itemcount:fish}',
        );
      }
      continue;
    }

    if (node.name === 'modifybal') {
      checkAmount(node.args[0], 'modifybal', true, errors);
      continue;
    }

    if (node.name === 'modifyinv') {
      if ((node.args[0] ?? '').length === 0 || node.args.length < 2) {
        errors.push(
          '{modifyinv} needs an item and an amount, like {modifyinv:milk|-3}',
        );
      } else {
        checkAmount(node.args[1], 'modifyinv', true, errors);
      }
      continue;
    }
  }

  if (boundaries > MAX_SEGMENTS - 1) {
    errors.push(
      `that would send more than ${MAX_SEGMENTS} messages ! max is ${MAX_SEGMENTS} (so up to ${MAX_SEGMENTS - 1} {split}/{delay} tags)`,
    );
  }

  return errors;
}
