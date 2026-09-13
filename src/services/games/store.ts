import { getGuildSetting, setGuildSetting } from '../guildSettings.js';
import { getCooldownRemaining, setCooldown, gameScope } from '../cooldowns.js';

export function getGameCooldownRemaining(
  guildId: string,
  game: string,
  userId: string,
): number {
  return getCooldownRemaining(guildId, gameScope(game), userId);
}

export function setGameCooldown(
  guildId: string,
  game: string,
  userId: string,
  seconds: number,
): void {
  setCooldown(guildId, gameScope(game), userId, seconds);
}

export function isGameEnabled(guildId: string, game: string): boolean {
  return getGuildSetting(guildId, `${game}.enabled`) !== '0';
}

export function setGameEnabled(
  guildId: string,
  game: string,
  enabled: boolean,
): void {
  setGuildSetting(guildId, `${game}.enabled`, enabled ? '1' : '0');
}

function settingIntOrZero(guildId: string, key: string): number | null {
  const raw = getGuildSetting(guildId, key);
  if (raw === null) return null;

  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export interface GamblingSettings {
  minBet: number;
  maxBet: number;
}

const DEFAULT_GAMBLING: GamblingSettings = {
  minBet: 10,
  maxBet: 0,
};

export function getGamblingSettings(guildId: string): GamblingSettings {
  return {
    minBet: settingInt(guildId, 'gambling.min') ?? DEFAULT_GAMBLING.minBet,
    maxBet:
      settingIntOrZero(guildId, 'gambling.max') ?? DEFAULT_GAMBLING.maxBet,
  };
}

export function setGamblingSettings(
  guildId: string,
  settings: Partial<GamblingSettings>,
): void {
  if (settings.minBet !== undefined) {
    setGuildSetting(guildId, 'gambling.min', String(settings.minBet));
  }
  if (settings.maxBet !== undefined) {
    setGuildSetting(guildId, 'gambling.max', String(settings.maxBet));
  }
}

export function isGamblingEnabled(guildId: string): boolean {
  return isGameEnabled(guildId, 'gambling');
}

export function setGamblingEnabled(guildId: string, enabled: boolean): void {
  setGameEnabled(guildId, 'gambling', enabled);
}

export interface PatSettings {
  minReward: number;
  maxReward: number;
  cooldownSeconds: number;
}

const DEFAULT_PAT: PatSettings = {
  minReward: 30,
  maxReward: 60,
  cooldownSeconds: 3600,
};

function settingInt(guildId: string, key: string): number | null {
  const raw = getGuildSetting(guildId, key);
  if (raw === null) return null;

  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function getPatSettings(guildId: string): PatSettings {
  return {
    minReward: settingInt(guildId, 'pat.min') ?? DEFAULT_PAT.minReward,
    maxReward: settingInt(guildId, 'pat.max') ?? DEFAULT_PAT.maxReward,
    cooldownSeconds:
      settingInt(guildId, 'pat.cooldown') ?? DEFAULT_PAT.cooldownSeconds,
  };
}

export function setPatSettings(
  guildId: string,
  settings: Partial<PatSettings>,
): void {
  if (settings.minReward !== undefined) {
    setGuildSetting(guildId, 'pat.min', String(settings.minReward));
  }
  if (settings.maxReward !== undefined) {
    setGuildSetting(guildId, 'pat.max', String(settings.maxReward));
  }
  if (settings.cooldownSeconds !== undefined) {
    setGuildSetting(guildId, 'pat.cooldown', String(settings.cooldownSeconds));
  }
}
