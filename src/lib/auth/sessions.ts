/**
 * sessions.ts — session management backed by the SQLite sessions table.
 */

import { randomBytes } from 'node:crypto';
import { db } from '../db.ts';
import { config } from '../../config.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionData {
  lang?: string;
}

export interface Session {
  sid: string;
  userId: number;
  data: SessionData;
}

// ── Statements ────────────────────────────────────────────────────────────────

const stmtCreate = db.prepare(`
  INSERT INTO sessions (sid, user_id, data, expires) VALUES (?, ?, ?, ?)
`);

const stmtGet = db.prepare(`
  SELECT sid, user_id, data FROM sessions WHERE sid = ? AND expires > strftime('%Y-%m-%dT%H:%M:%SZ','now')
`);

const stmtDestroy = db.prepare(`
  DELETE FROM sessions WHERE sid = ?
`);

const stmtUpdate = db.prepare(`
  UPDATE sessions SET data = ? WHERE sid = ?
`);

const stmtPurge = db.prepare(`
  DELETE FROM sessions WHERE expires <= strftime('%Y-%m-%dT%H:%M:%SZ','now')
`);

// ── Public API ────────────────────────────────────────────────────────────────

export function createSession(userId: number, data: SessionData = {}): string {
  const sid = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.SESSION_MAX_AGE).toISOString();
  stmtCreate.run(sid, userId, JSON.stringify(data), expires);
  return sid;
}

export function getSession(sid: string): Session | undefined {
  const row = stmtGet.get(sid) as { sid: string; user_id: number; data: string } | undefined;
  if (!row) return undefined;

  return {
    sid: row.sid,
    userId: row.user_id,
    data: JSON.parse(row.data) as SessionData,
  };
}

export function updateSessionData(sid: string, data: SessionData): void {
  stmtUpdate.run(JSON.stringify(data), sid);
}

export function destroySession(sid: string): void {
  stmtDestroy.run(sid);
}

export function purgeExpired(): void {
  stmtPurge.run();
}
