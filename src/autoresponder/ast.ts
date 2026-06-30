export interface TextNode {
  kind: 'text';
  value: string;
}

export interface PlaceholderNode {
  kind: 'placeholder';
  name: string;
  args: string[];
  raw: string;
}

export interface CaptureRefNode {
  kind: 'capture-ref';
  name: string;
  raw: string;
}

export type Node = TextNode | PlaceholderNode | CaptureRefNode;
