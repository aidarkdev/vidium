/**
 * db.ts — opens the SQLite database, applies connection PRAGMAs, and creates
 * all tables and indexes on first run (idempotent, safe to call on every restart).
 *
 * Usage: import { db } from './db.ts'
 *
 * Requires Node.js 24+ (node:sqlite stable since v24).
 */

import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.ts';

export const db: DatabaseSync = new DatabaseSync(config.DB_PATH);

// ── Connection PRAGMAs ────────────────────────────────────────────────────────

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous  = NORMAL;
  PRAGMA foreign_keys = ON;
`);

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tag_labels (
    tag   TEXT PRIMARY KEY,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    url                TEXT    NOT NULL UNIQUE,
    youtube_channel_id TEXT    NOT NULL DEFAULT '',
    tags               TEXT    NOT NULL DEFAULT '',
    last_crawled       TEXT
  );

  CREATE TABLE IF NOT EXISTS videos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id   INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    youtube_id   TEXT    NOT NULL UNIQUE,
    title        TEXT    NOT NULL DEFAULT '',
    date         TEXT    NOT NULL DEFAULT '',
    duration     INTEGER NOT NULL DEFAULT 0,
    video_status TEXT    NOT NULL DEFAULT 'none'
                   CHECK(video_status IN ('none','queued','downloading','ready','expired')),
    audio_status TEXT    NOT NULL DEFAULT 'none'
                   CHECK(audio_status IN ('none','queued','downloading','ready','expired')),
    source_type  TEXT    NOT NULL DEFAULT 'channel'
                   CHECK(source_type IN ('channel','manual')),
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL
                 CHECK(type IN (
                   'download_video','download_audio','download_thumbnail',
                   'crawl_channel'
                 )),
    payload    TEXT    NOT NULL DEFAULT '{}',
    status     TEXT    NOT NULL DEFAULT 'pending'
                 CHECK(status IN ('pending','processing','done','failed')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    error      TEXT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    login         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid      TEXT    PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data     TEXT    NOT NULL DEFAULT '{}',
    expires  TEXT    NOT NULL
  );
`);

// ── Indexes ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_videos_channel   ON videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_videos_date      ON videos(date DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_status      ON jobs(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
`);

// ── Migrations (idempotent) ───────────────────────────────────────────────────
// Drop columns that were removed from the schema.

const migrations = [
  `ALTER TABLE videos DROP COLUMN bytes_downloaded`,
  `ALTER TABLE videos DROP COLUMN added_by_user_id`,
  `ALTER TABLE videos DROP COLUMN updated_at`,
  `ALTER TABLE channels DROP COLUMN crawl_from_date`,
  `ALTER TABLE jobs DROP COLUMN updated_at`,
  `ALTER TABLE users DROP COLUMN role`,
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {}
}

// ── System channels ───────────────────────────────────────────────────────────

db.prepare(
  `INSERT OR IGNORE INTO channels (id, name, url, tags) VALUES (1, 'manual', '', 'manual')`,
).run();
