import { GuildPremiumTier } from 'discord.js';

import { logger } from '../logger.js';
import { CAPTURE_REF } from './args.js';

export const FILE_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'raw.githubusercontent.com',
  'cdn.discordapp.com',
  'media.discordapp.net',
]);

export const MB = 1024 * 1024;
const UPLOAD_LIMITS: Record<GuildPremiumTier, number> = {
  [GuildPremiumTier.None]: 10 * MB,
  [GuildPremiumTier.Tier1]: 10 * MB,
  [GuildPremiumTier.Tier2]: 50 * MB,
  [GuildPremiumTier.Tier3]: 100 * MB,
};

const DOWNLOAD_TIMEOUT_MS = 15_000;

export interface DownloadedFile {
  attachment: Buffer;
  name: string;
}

export function uploadLimit(tier: GuildPremiumTier, dm: boolean): number {
  return UPLOAD_LIMITS[dm ? GuildPremiumTier.None : tier];
}

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

export async function downloadFile(
  url: string,
  limit: number,
): Promise<DownloadedFile | null> {
  if (!isAllowedFileUrl(url)) {
    logger.warn({ url }, 'file host not allowed');
    return null;
  }

  const parsed = new URL(url);
  try {
    const response = await fetch(parsed.href, {
      redirect: 'error',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      logger.warn({ url, status: response.status }, 'file download failed');
      return null;
    }

    if (Number(response.headers.get('content-length')) > limit) {
      logger.warn({ url, limit }, 'file too big to upload');
      await response.body.cancel();
      return null;
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > limit) {
        logger.warn({ url, limit }, 'file too big to upload');
        return null;
      }
      chunks.push(chunk);
    }

    return {
      attachment: Buffer.concat(chunks),
      name: parsed.pathname.split('/').pop() || 'file',
    };
  } catch (err) {
    logger.warn({ err, url }, 'file download failed');
    return null;
  }
}
