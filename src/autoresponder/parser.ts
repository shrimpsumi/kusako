import type { Node } from './ast.js';

function parsePlaceholder(raw: string): Node {
  const inner = raw.slice(1, -1);
  const sep = inner.indexOf(':');

  if (sep === -1) {
    return { kind: 'placeholder', name: inner.trim(), args: [], raw };
  }

  const name = inner.slice(0, sep).trim();
  const args = inner
    .slice(sep + 1)
    .split('|')
    .map((arg) => arg.trim());

  return { kind: 'placeholder', name, args, raw };
}

function parseCaptureRef(raw: string): Node {
  return { kind: 'capture-ref', name: raw.slice(1, -1).trim(), raw };
}

export function parse(template: string): Node[] {
  const nodes: Node[] = [];
  let text = '';
  let i = 0;

  const flushText = () => {
    if (text.length > 0) {
      nodes.push({ kind: 'text', value: text });
      text = '';
    }
  };

  while (i < template.length) {
    const char = template[i];
    const next = template[i + 1];

    if (
      char === next &&
      (char === '{' || char === '}' || char === '[' || char === ']')
    ) {
      text += char;
      i += 2;
      continue;
    }

    if (char === '{' || char === '[') {
      const close = char === '{' ? '}' : ']';
      const end = template.indexOf(close, i + 1);

      if (end === -1) {
        text += char;
        i += 1;
        continue;
      }

      const raw = template.slice(i, end + 1);
      flushText();
      nodes.push(char === '{' ? parsePlaceholder(raw) : parseCaptureRef(raw));
      i = end + 1;
      continue;
    }

    text += char;
    i += 1;
  }

  flushText();
  return nodes;
}
