const NAME_MAX = 100;
const CUSTOM_EMOJI = /<a?:\w+:\d+>/g;

export function threadName(username: string, text: string): string {
  const flat = text.replace(CUSTOM_EMOJI, '').replace(/\s+/g, ' ').trim();
  const full = `${username} > ${flat.length > 0 ? flat : 'image'}`;
  if (full.length <= NAME_MAX) return full;

  return `${full.slice(0, NAME_MAX - 1).replace(/[\uD800-\uDBFF]$/, '')}…`;
}
