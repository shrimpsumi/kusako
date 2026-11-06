import type { Sticky } from './store.js';

export function stickyDue(
  sticky: Pick<Sticky, 'everyMessages' | 'minSeconds'>,
  count: number,
  lastPostedAt: number,
  now: number,
): number | null {
  if (count < Math.max(1, sticky.everyMessages)) return null;

  return Math.max(0, lastPostedAt + sticky.minSeconds * 1000 - now);
}
