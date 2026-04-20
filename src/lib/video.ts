/**
 * video.ts — data access layer for the videos table.
 */

import { db } from './db.ts';

export interface VideoRow {
  youtubeId: string;
  title: string;
  channelName: string;
  date: string;
  duration: number;
  videoStatus: string;
  audioStatus: string;
}

export interface VideoEntry {
  youtubeId: string;
  title: string;
  date: string;
  duration?: number;
}

// ── Statements ────────────────────────────────────────────────────────────────

const SEL = `
  SELECT v.youtube_id, v.title, v.date, v.duration, v.video_status, v.audio_status,
         COALESCE(c.name, '') AS channel_name
  FROM videos v LEFT JOIN channels c ON v.channel_id = c.id`;

const stmtGetById = db.prepare(`${SEL} WHERE v.youtube_id = ?`);
const stmtGetAll = db.prepare(`${SEL} ORDER BY v.date DESC, v.created_at DESC LIMIT 200`);
const stmtGetByChannel = db.prepare(
  `${SEL} WHERE v.channel_id = ? ORDER BY v.date DESC, v.created_at DESC LIMIT 100`,
);
const stmtCountByChannel = db.prepare(`SELECT COUNT(*) as n FROM videos WHERE channel_id = ?`);
const stmtGetByTag = db.prepare(`
  SELECT v.youtube_id, v.title, v.date, v.duration, v.video_status, v.audio_status,
         COALESCE(c.name, '') AS channel_name
  FROM videos v JOIN channels c ON v.channel_id = c.id
  WHERE (',' || c.tags || ',') LIKE ('%,' || ? || ',%')
  ORDER BY v.date DESC, v.created_at DESC LIMIT 200`);
const stmtGetSince = db.prepare(
  `${SEL} WHERE v.created_at > ? ORDER BY v.date DESC, v.created_at DESC LIMIT 50`,
);
const stmtGetReady = db.prepare(
  `${SEL} WHERE v.video_status = 'ready' OR v.audio_status = 'ready' ORDER BY v.date DESC, v.created_at DESC LIMIT 200`,
);
const stmtExists = db.prepare(`SELECT id FROM videos WHERE youtube_id = ?`);
const stmtSetVideoStatus = db.prepare(`UPDATE videos SET video_status = ? WHERE youtube_id = ?`);
const stmtSetAudioStatus = db.prepare(`UPDATE videos SET audio_status = ? WHERE youtube_id = ?`);
const stmtSetDuration = db.prepare(
  `UPDATE videos SET duration = ? WHERE youtube_id = ? AND duration = 0`,
);
const stmtInsert = db.prepare(`
  INSERT INTO videos (channel_id, youtube_id, title, date, duration, source_type)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (youtube_id) DO NOTHING
`);

// ── Internal ──────────────────────────────────────────────────────────────────

type RawRow = {
  youtube_id: string;
  title: string;
  channel_name: string;
  date: string;
  duration: number;
  video_status: string;
  audio_status: string;
};

function toRow(r: RawRow): VideoRow {
  return {
    youtubeId: r.youtube_id,
    title: r.title,
    channelName: r.channel_name,
    date: r.date,
    duration: r.duration,
    videoStatus: r.video_status,
    audioStatus: r.audio_status,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getVideoById(youtubeId: string): VideoRow | undefined {
  const r = stmtGetById.get(youtubeId) as RawRow | undefined;
  return r ? toRow(r) : undefined;
}

export function getAllVideos(): VideoRow[] {
  return (stmtGetAll.all() as RawRow[]).map(toRow);
}

export function getVideosByChannel(channelId: number): VideoRow[] {
  return (stmtGetByChannel.all(channelId) as RawRow[]).map(toRow);
}

export function countVideosByChannel(channelId: number): number {
  return (stmtCountByChannel.get(channelId) as { n: number }).n;
}

export function getVideosByTag(tag: string): VideoRow[] {
  return (stmtGetByTag.all(tag) as RawRow[]).map(toRow);
}

export function getNewVideosSince(isoTimestamp: string): VideoRow[] {
  return (stmtGetSince.all(isoTimestamp) as RawRow[]).map(toRow);
}

export function getReadyVideos(): VideoRow[] {
  return (stmtGetReady.all() as RawRow[]).map(toRow);
}

export function videoExists(youtubeId: string): boolean {
  return !!stmtExists.get(youtubeId);
}

export function setVideoStatus(youtubeId: string, status: string): void {
  stmtSetVideoStatus.run(status, youtubeId);
}

export function setAudioStatus(youtubeId: string, status: string): void {
  stmtSetAudioStatus.run(status, youtubeId);
}

export function setDurationIfZero(youtubeId: string, duration: number): void {
  stmtSetDuration.run(duration, youtubeId);
}

export function insertVideos(entries: VideoEntry[], channelId: number, sourceType: string): void {
  db.exec('BEGIN');
  try {
    for (const e of entries) {
      stmtInsert.run(channelId, e.youtubeId, e.title, e.date, e.duration ?? 0, sourceType);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
