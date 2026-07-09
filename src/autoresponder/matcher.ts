import type { MatchMode } from './store.js';

export function matchesTrigger(
  content: string,
  trigger: string,
  mode: MatchMode,
): boolean {
  if (mode === 'event') return false;

  const trig = trigger.toLowerCase().trim();
  if (trig.length === 0) return false;

  const msg = content.toLowerCase();

  if (mode === 'exact') {
    return msg.trim() === trig;
  }

  if (mode === 'includes') {
    return msg.includes(trig);
  }

  if (mode === 'startswith') {
    const trimmed = msg.trimStart();
    if (!trimmed.startsWith(trig)) return false;
    const after = trimmed[trig.length];
    return after === undefined || /\s/.test(after);
  }

  const trimmed = msg.trimEnd();
  if (!trimmed.endsWith(trig)) return false;
  const before = trimmed[trimmed.length - trig.length - 1];
  return before === undefined || /\s/.test(before);
}
