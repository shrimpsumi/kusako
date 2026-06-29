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
