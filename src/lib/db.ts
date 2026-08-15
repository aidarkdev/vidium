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
  CREATE TABLE IF NOT EXISTS tags (
    tag   TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS channels (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    url                TEXT    NOT NULL UNIQUE,
    youtube_channel_id TEXT    NOT NULL DEFAULT '',
    last_crawled       TEXT,
    display_name       TEXT    NOT NULL DEFAULT '',
    sort_order         INTEGER NOT NULL DEFAULT 0,
    auto_download_video INTEGER NOT NULL DEFAULT 0,
    auto_download_audio INTEGER NOT NULL DEFAULT 0,
    guest_visible      INTEGER NOT NULL DEFAULT 0,
    rss_enabled        INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS channel_tags (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    tag        TEXT    NOT NULL REFERENCES tags(tag) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, tag)
  );

  CREATE TABLE IF NOT EXISTS videos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id   INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    uid          TEXT    NOT NULL UNIQUE,
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
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    ready_at     TEXT,
    chapters_json TEXT   NOT NULL DEFAULT '[]'
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
    role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid      TEXT    PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data     TEXT    NOT NULL DEFAULT '{}',
    expires  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS video_play_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL CHECK(kind IN ('video','audio')),
    played_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS video_play_counts (
    video_id        INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    kind            TEXT    NOT NULL CHECK(kind IN ('video','audio')),
    play_count      INTEGER NOT NULL DEFAULT 0 CHECK(play_count >= 0),
    first_played_at TEXT    NOT NULL,
    last_played_at  TEXT    NOT NULL,
    PRIMARY KEY (video_id, kind)
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
`);

// Import the legacy append-only events exactly once. The old table is retained
// so an application rollback does not require a reverse schema migration.
db.exec(`
  BEGIN IMMEDIATE;
  INSERT OR IGNORE INTO video_play_counts (
    video_id, kind, play_count, first_played_at, last_played_at
  )
  SELECT
    video_id, kind, COUNT(*), MIN(played_at), MAX(played_at)
  FROM video_play_events
  WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE name = 'aggregate-play-counts-v1'
  )
  GROUP BY video_id, kind;
  INSERT OR IGNORE INTO schema_migrations (name) VALUES ('aggregate-play-counts-v1');
  COMMIT;
`);

// ── Indexes ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_videos_channel   ON videos(channel_id);
  CREATE INDEX IF NOT EXISTS idx_videos_date      ON videos(date DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_uid ON videos(uid);
  CREATE INDEX IF NOT EXISTS idx_channel_tags_tag ON channel_tags(tag);
  CREATE INDEX IF NOT EXISTS idx_jobs_status      ON jobs(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
  CREATE INDEX IF NOT EXISTS idx_video_play_events_video ON video_play_events(video_id, played_at DESC);
`);

function hasColumn(table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (row) => row.name === column,
  );
}

if (!hasColumn('tags', 'sort_order')) {
  db.exec('ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
}

if (!hasColumn('channels', 'auto_download_video')) {
  db.exec('ALTER TABLE channels ADD COLUMN auto_download_video INTEGER NOT NULL DEFAULT 0');
}

if (!hasColumn('channels', 'auto_download_audio')) {
  db.exec('ALTER TABLE channels ADD COLUMN auto_download_audio INTEGER NOT NULL DEFAULT 0');
}

if (!hasColumn('channels', 'guest_visible')) {
  db.exec('ALTER TABLE channels ADD COLUMN guest_visible INTEGER NOT NULL DEFAULT 0');
}

if (!hasColumn('channels', 'rss_enabled')) {
  db.exec('ALTER TABLE channels ADD COLUMN rss_enabled INTEGER NOT NULL DEFAULT 1');
}

if (!hasColumn('videos', 'chapters_json')) {
  db.exec(`ALTER TABLE videos ADD COLUMN chapters_json TEXT NOT NULL DEFAULT '[]'`);
}

if (!hasColumn('videos', 'uid')) {
  db.exec(`ALTER TABLE videos ADD COLUMN uid TEXT`);
}

// ── System channels ───────────────────────────────────────────────────────────

db.prepare(`INSERT OR IGNORE INTO channels (id, name, url) VALUES (1, 'manual', '')`).run();
db.prepare(
  `UPDATE channels SET display_name = 'Загрузки' WHERE id = 1 AND display_name = ''`,
).run();
