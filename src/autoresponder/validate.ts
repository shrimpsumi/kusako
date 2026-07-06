import type { Node } from './ast.js';
import { generators, RANGE_FORMAT } from './generators.js';

export function validateTemplate(nodes: Node[]): string[] {
  const errors: string[] = [];
  const bound = new Set<string>();

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
        errors.push(`{range} needs a number span, like {range:10-100}`);
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
    }
  }

  return errors;
}
