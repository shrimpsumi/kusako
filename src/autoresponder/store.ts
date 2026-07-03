import { db } from '../db.js';

export type MatchMode = 'exact' | 'startswith' | 'endswith' | 'includes';

export interface Autoresponder {
  guildId: string;
  trigger: string;
  response: string;
  matchMode: MatchMode;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  guild_id: string;
  trigger: string;
  response: string;
  match_mode: MatchMode;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): Autoresponder {
  return {
    guildId: row.guild_id,
    trigger: row.trigger,
    response: row.response,
    matchMode: row.match_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function key(trigger: string): string {
  return trigger.toLowerCase();
}

export function getAutoresponder(
  guildId: string,
  trigger: string,
): Autoresponder | null {
  const row = db()
    .prepare(
      'SELECT * FROM autoresponders WHERE guild_id = ? AND trigger_key = ?',
    )
    .get(guildId, key(trigger)) as Row | undefined;

  return row ? toModel(row) : null;
}

export function listAutoresponders(guildId: string): Autoresponder[] {
  const rows = db()
    .prepare(
      'SELECT * FROM autoresponders WHERE guild_id = ? ORDER BY trigger_key',
    )
    .all(guildId) as Row[];

  return rows.map(toModel);
}

export function addAutoresponder(
  guildId: string,
  trigger: string,
  response: string,
): boolean {
  const now = Date.now();
  const result = db()
    .prepare(
      `INSERT OR IGNORE INTO autoresponders
        (guild_id, trigger, trigger_key, response, match_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'exact', ?, ?)`,
    )
    .run(guildId, trigger, key(trigger), response, now, now);

  return result.changes > 0;
}

export function editAutoresponder(
  guildId: string,
  trigger: string,
  response: string,
): boolean {
  const result = db()
    .prepare(
      `UPDATE autoresponders SET response = ?, updated_at = ?
       WHERE guild_id = ? AND trigger_key = ?`,
    )
    .run(response, Date.now(), guildId, key(trigger));

  return result.changes > 0;
}

export function removeAutoresponder(guildId: string, trigger: string): boolean {
  const result = db()
    .prepare(
      'DELETE FROM autoresponders WHERE guild_id = ? AND trigger_key = ?',
    )
    .run(guildId, key(trigger));

  return result.changes > 0;
}
