import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { env } from './env.js';
import { logger } from './logger.js';

const DB_PATH = resolve(process.cwd(), env.dbPath);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS autoresponders (
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  response TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'exact',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, trigger_key)
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, key)
);

CREATE TABLE IF NOT EXISTS balances (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_guild_user
  ON transactions (guild_id, user_id);

CREATE TABLE IF NOT EXISTS items (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name_key)
);

CREATE TABLE IF NOT EXISTS inventories (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, item_key),
  FOREIGN KEY (guild_id, item_key)
    REFERENCES items (guild_id, name_key)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ar_cooldowns (
  guild_id TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, trigger_key, user_id),
  FOREIGN KEY (guild_id, trigger_key)
    REFERENCES autoresponders (guild_id, trigger_key)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  content TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_send_at
  ON scheduled_messages (send_at);
`;

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;

  mkdirSync(dirname(DB_PATH), { recursive: true });
  instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.exec(SCHEMA);

  logger.debug({ path: DB_PATH }, 'sqlite opened');
  return instance;
}

export function closeDb(): void {
  if (!instance) return;
  instance.close();
  instance = null;
}
