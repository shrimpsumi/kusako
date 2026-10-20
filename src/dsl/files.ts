import { CAPTURE_REF } from './args.js';

export const FILE_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'raw.githubusercontent.com',
  'cdn.discordapp.com',
  'media.discordapp.net',
]);

export function isAllowedFileUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === '' &&
    FILE_HOSTS.has(parsed.hostname)
  );
}

export function literalFileUrl(url: string): string | null {
  const capture = url.search(CAPTURE_REF);
  if (capture === -1) return url;
  const before = url.slice(0, capture);
  return /^[^:/?#]+:\/\/[^/?#]*[/?#]/.test(before) ? before : null;
}
