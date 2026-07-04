import type { Node } from './ast.js';
import type { RenderContext } from './context.js';
import { placeholders } from './placeholders.js';

export async function render(
  nodes: Node[],
  ctx: RenderContext,
): Promise<string> {
  let out = '';

  for (const node of nodes) {
    if (node.kind === 'text') {
      out += node.value;
      continue;
    }

    if (node.kind === 'placeholder') {
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
      continue;
    }

    out += node.raw;
  }

  return out;
}
