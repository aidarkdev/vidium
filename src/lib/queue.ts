/**
 * queue.ts — job queue backed by the SQLite jobs table.
 *
 * Server calls enqueue(). Worker calls take(), then complete() or fail().
 * On worker startup, resetStale() resets any stuck 'processing' jobs back to 'pending'.
 * Failed jobs are retried up to MAX_ATTEMPTS times before being marked 'failed'.
 */

import { db } from './db.ts';

const MAX_ATTEMPTS = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobType = 'download_video' | 'download_audio' | 'download_thumbnail' | 'crawl_channel';

export interface Job {
  id: number;
  type: JobType;
  payload: string; // JSON string
}

// ── Statements ────────────────────────────────────────────────────────────────

const stmtEnqueue = db.prepare(`
  INSERT INTO jobs (type, payload) VALUES (?, ?)
`);

const stmtTake = db.prepare(`
  UPDATE jobs
  SET status = 'processing', attempts = attempts + 1  WHERE id = (
    SELECT id FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1
  )
  RETURNING id, type, payload
`);

const stmtComplete = db.prepare(`
  UPDATE jobs
  SET status = 'done'  WHERE id = ?
`);

const stmtRetry = db.prepare(`
  UPDATE jobs
  SET status = 'pending', error = ?  WHERE id = ?
`);

const stmtFail = db.prepare(`
  UPDATE jobs
  SET status = 'failed', error = ?  WHERE id = ?
`);

const stmtGetAttempts = db.prepare(`
  SELECT attempts FROM jobs WHERE id = ?
`);

const stmtResetStale = db.prepare(`
  UPDATE jobs
  SET status = 'pending'  WHERE status = 'processing'
`);

// ── Public API ────────────────────────────────────────────────────────────────

export function enqueue(type: JobType, payload: Record<string, unknown>): void {
  stmtEnqueue.run(type, JSON.stringify(payload));
}

export function take(): Job | undefined {
  const row = stmtTake.get() as { id: number; type: JobType; payload: string } | undefined;
  return row;
}

export function complete(id: number): void {
  stmtComplete.run(id);
}

export function fail(id: number, error: string): void {
  const row = stmtGetAttempts.get(id) as { attempts: number } | undefined;
  const attempts = row?.attempts ?? MAX_ATTEMPTS;

  if (attempts < MAX_ATTEMPTS) {
    stmtRetry.run(error, id);
  } else {
    stmtFail.run(error, id);
  }
}

export function resetStale(): void {
  stmtResetStale.run();
}
