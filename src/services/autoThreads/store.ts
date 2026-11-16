import { db } from '../../db.js';

export const MAX_AUTO_THREADS_PER_GUILD = 10;
export const DEFAULT_SLOWMODE_SECONDS = 0;

export interface AutoThread {
  guildId: string;
  channelId: string;
  response: string;
  slowmodeSeconds: number;
  closeButton: boolean;
  lock: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NewAutoThread {
  guildId: string;
  channelId: string;
  response?: string;
  slowmodeSeconds?: number;
  closeButton?: boolean;
  lock?: boolean;
}

export type CreateAutoThreadResult =
  | { ok: true; autoThread: AutoThread }
  | { ok: false; reason: 'exists' | 'full' };

interface Row {
  guild_id: string;
  channel_id: string;
  response: string;
  slowmode_seconds: number;
  close_button: number;
  lock_on_close: number;
  created_at: number;
  updated_at: number;
}

function toModel(row: Row): AutoThread {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    response: row.response,
    slowmodeSeconds: row.slowmode_seconds,
    closeButton: row.close_button === 1,
    lock: row.lock_on_close === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAutoThread(
  guildId: string,
  channelId: string,
): AutoThread | null {
  const row = db()
    .prepare('SELECT * FROM auto_threads WHERE guild_id = ? AND channel_id = ?')
    .get(guildId, channelId) as Row | undefined;

  return row ? toModel(row) : null;
}

export function listAutoThreads(guildId: string): AutoThread[] {
  const rows = db()
    .prepare(
      'SELECT * FROM auto_threads WHERE guild_id = ? ORDER BY created_at',
    )
    .all(guildId) as Row[];

  return rows.map(toModel);
}

export function countAutoThreads(guildId: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM auto_threads WHERE guild_id = ?')
    .get(guildId) as { n: number };

  return row.n;
}

export function createAutoThread(input: NewAutoThread): CreateAutoThreadResult {
  const now = Date.now();

  const insert = db().transaction((): CreateAutoThreadResult => {
    if (getAutoThread(input.guildId, input.channelId)) {
      return { ok: false, reason: 'exists' };
    }
    if (countAutoThreads(input.guildId) >= MAX_AUTO_THREADS_PER_GUILD) {
      return { ok: false, reason: 'full' };
    }

    db()
      .prepare(
        `INSERT INTO auto_threads
           (guild_id, channel_id, response, slowmode_seconds,
            close_button, lock_on_close, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.guildId,
        input.channelId,
        input.response ?? '',
        input.slowmodeSeconds ?? DEFAULT_SLOWMODE_SECONDS,
        input.closeButton ? 1 : 0,
        input.lock ? 1 : 0,
        now,
        now,
      );

    return {
      ok: true,
      autoThread: getAutoThread(input.guildId, input.channelId)!,
    };
  });

  return insert();
}

export interface AutoThreadEdit {
  response?: string;
  slowmodeSeconds?: number;
  closeButton?: boolean;
  lock?: boolean;
}

const EDIT_COLUMNS: Record<keyof AutoThreadEdit, string> = {
  response: 'response',
  slowmodeSeconds: 'slowmode_seconds',
  closeButton: 'close_button',
  lock: 'lock_on_close',
};

export function updateAutoThread(
  guildId: string,
  channelId: string,
  edit: AutoThreadEdit,
): AutoThread | null {
  const assignments: string[] = [];
  const values: Array<string | number> = [];

  for (const [key, column] of Object.entries(EDIT_COLUMNS)) {
    const value = edit[key as keyof AutoThreadEdit];
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }

  if (assignments.length === 0) return getAutoThread(guildId, channelId);

  db()
    .prepare(
      `UPDATE auto_threads SET ${assignments.join(', ')}, updated_at = ?
       WHERE guild_id = ? AND channel_id = ?`,
    )
    .run(...values, Date.now(), guildId, channelId);

  return getAutoThread(guildId, channelId);
}

export function removeAutoThread(
  guildId: string,
  channelId: string,
): AutoThread | null {
  const remove = db().transaction((): AutoThread | null => {
    const autoThread = getAutoThread(guildId, channelId);
    if (!autoThread) return null;

    db()
      .prepare('DELETE FROM auto_threads WHERE guild_id = ? AND channel_id = ?')
      .run(guildId, channelId);

    return autoThread;
  });

  return remove();
}
