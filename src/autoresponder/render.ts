import type { Node } from './ast.js';
import type { RenderContext } from './context.js';
import { generators } from './generators.js';
import { placeholders } from './placeholders.js';

export async function render(
  nodes: Node[],
  ctx: RenderContext,
): Promise<string> {
  const captures = new Map<string, string>();
  let out = '';

  for (const node of nodes) {
    if (node.kind === 'text') {
      out += node.value;
      continue;
    }

    if (node.kind === 'capture-ref') {
      out += captures.get(node.name) ?? node.raw;
      continue;
    }

    const generate = generators.get(node.name);
    if (generate) {
      try {
        captures.set(node.captureName ?? node.name, generate(ctx, node.args));
      } catch {
        out += node.raw;
      }
      continue;
    }

    const resolver = placeholders.get(node.name);
    if (!resolver) {
      out += node.raw;
      continue;
    }
    try {
      out += await resolver(ctx, node.args);
    } catch {
      out += node.raw;
    }
  }

  return out.trim();
}
