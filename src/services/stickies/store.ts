import { db } from '../../db.js';

export const MAX_STICKIES_PER_GUILD = 10;
export const DEFAULT_EVERY_MESSAGES = 5;
export const DEFAULT_MIN_SECONDS = 60;

export interface Sticky {
  guildId: string;
  channelId: string;
  response: string;
  everyMessages: number;
  minSeconds: number;
  lastMessageId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewSticky {
  guildId: string;
  channelId: string;
  response: string;
  everyMessages?: number;
  minSeconds?: number;
}

export type CreateStickyResult =
  | { ok: true; sticky: Sticky }
  | { ok: false; reason: 'exists' | 'full' };

interface Row {
  guild_id: string;
  channel_id: string;
  response: string;
  every_n_messages: number;
  min_seconds: number;
  last_message_id: string | null;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): Sticky {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    response: row.response,
    everyMessages: row.every_n_messages,
    minSeconds: row.min_seconds,
    lastMessageId: row.last_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getSticky(guildId: string, channelId: string): Sticky | null {
  const row = db()
    .prepare(
      'SELECT * FROM sticky_messages WHERE guild_id = ? AND channel_id = ?',
    )
    .get(guildId, channelId) as Row | undefined;

  return row ? toModel(row) : null;
}

export function listStickies(guildId: string): Sticky[] {
  const rows = db()
    .prepare(
      'SELECT * FROM sticky_messages WHERE guild_id = ? ORDER BY created_at',
    )
    .all(guildId) as Row[];

  return rows.map(toModel);
}

export function countStickies(guildId: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM sticky_messages WHERE guild_id = ?')
    .get(guildId) as { n: number };

  return row.n;
}

export function createSticky(input: NewSticky): CreateStickyResult {
  const now = Date.now();

  const insert = db().transaction((): CreateStickyResult => {
    if (getSticky(input.guildId, input.channelId)) {
      return { ok: false, reason: 'exists' };
    }
    if (countStickies(input.guildId) >= MAX_STICKIES_PER_GUILD) {
      return { ok: false, reason: 'full' };
    }

    db()
      .prepare(
        `INSERT INTO sticky_messages
           (guild_id, channel_id, response, every_n_messages, min_seconds,
            last_message_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        input.guildId,
        input.channelId,
        input.response,
        input.everyMessages ?? DEFAULT_EVERY_MESSAGES,
        input.minSeconds ?? DEFAULT_MIN_SECONDS,
        now,
        now,
      );

    return { ok: true, sticky: getSticky(input.guildId, input.channelId)! };
  });

  return insert();
}

export interface StickyEdit {
  response?: string;
  everyMessages?: number;
  minSeconds?: number;
}

const EDIT_COLUMNS: Record<keyof StickyEdit, string> = {
  response: 'response',
  everyMessages: 'every_n_messages',
  minSeconds: 'min_seconds',
};

export function updateSticky(
  guildId: string,
  channelId: string,
  edit: StickyEdit,
): Sticky | null {
  const assignments: string[] = [];
  const values: Array<string | number> = [];

  for (const [key, column] of Object.entries(EDIT_COLUMNS)) {
    const value = edit[key as keyof StickyEdit];
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    values.push(value);
  }

  if (assignments.length === 0) return getSticky(guildId, channelId);

  db()
    .prepare(
      `UPDATE sticky_messages SET ${assignments.join(', ')}, updated_at = ?
       WHERE guild_id = ? AND channel_id = ?`,
    )
    .run(...values, Date.now(), guildId, channelId);

  return getSticky(guildId, channelId);
}

export function setStickyMessage(
  guildId: string,
  channelId: string,
  messageId: string | null,
): void {
  db()
    .prepare(
      `UPDATE sticky_messages SET last_message_id = ?
       WHERE guild_id = ? AND channel_id = ?`,
    )
    .run(messageId, guildId, channelId);
}

export function removeSticky(
  guildId: string,
  channelId: string,
): Sticky | null {
  const remove = db().transaction((): Sticky | null => {
    const sticky = getSticky(guildId, channelId);
    if (!sticky) return null;

    db()
      .prepare(
        'DELETE FROM sticky_messages WHERE guild_id = ? AND channel_id = ?',
      )
      .run(guildId, channelId);

    return sticky;
  });

  return remove();
}
