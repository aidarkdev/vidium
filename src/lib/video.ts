/**
 * video.ts — data access layer for the videos table.
 */

import { db } from './db.ts';

export interface VideoRow {
  youtubeId: string;
  title: string;
  channelId: number;
  channelName: string;
  date: string;
  duration: number;
  videoStatus: string;
  audioStatus: string;
  chapters: VideoChapter[];
}

export interface VideoChapter {
  title: string;
  start: number;
  end: number;
}

export interface VideoEntry {
  youtubeId: string;
  title: string;
  date: string;
  duration?: number;
}

export interface VideoStatusSummary {
  status: string;
  videoCount: number;
  audioCount: number;
}

export interface VideoStatusRow {
  youtubeId: string;
  title: string;
  videoStatus: string;
  audioStatus: string;
  readyAt: string;
  createdAt: string;
}

export interface DownloadedVideoRow {
  youtubeId: string;
  title: string;
  videoStatus: string;
  audioStatus: string;
  readyAt: string;
  createdAt: string;
}

// ── Statements ────────────────────────────────────────────────────────────────

const SEL = `
  SELECT v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v LEFT JOIN channels c ON v.channel_id = c.id`;
const SEL_WITH_CHAPTERS = `
  SELECT v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         v.chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v LEFT JOIN channels c ON v.channel_id = c.id`;

const stmtGetById = db.prepare(`${SEL_WITH_CHAPTERS} WHERE v.youtube_id = ?`);
const stmtGetAll = db.prepare(`${SEL} ORDER BY v.date DESC, v.created_at DESC LIMIT 200`);
const stmtGetByChannel = db.prepare(
  `${SEL} WHERE v.channel_id = ? ORDER BY v.date DESC, v.created_at DESC LIMIT 100`,
);
const stmtGetByTag = db.prepare(`
  SELECT v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v
  JOIN channel_tags ct ON ct.channel_id = v.channel_id
  JOIN channels c ON v.channel_id = c.id
  WHERE ct.tag = ?
  ORDER BY v.date DESC, v.created_at DESC LIMIT 200`);
const stmtGetByTagManual = db.prepare(`
  SELECT v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v JOIN channels c ON v.channel_id = c.id
  WHERE v.source_type = 'manual'
  ORDER BY v.created_at DESC, v.date DESC LIMIT 200`);
const stmtGetSince = db.prepare(
  `${SEL} WHERE v.created_at > ? ORDER BY v.date DESC, v.created_at DESC LIMIT 50`,
);
const stmtGetSinceByChannel = db.prepare(
  `${SEL} WHERE v.created_at > ? AND v.channel_id = ? ORDER BY v.date DESC, v.created_at DESC LIMIT 50`,
);
const stmtGetSinceByTag = db.prepare(`
  SELECT v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v
  JOIN channel_tags ct ON ct.channel_id = v.channel_id
  JOIN channels c ON v.channel_id = c.id
  WHERE v.created_at > ? AND ct.tag = ?
  ORDER BY v.date DESC, v.created_at DESC LIMIT 50`);
const stmtGetSinceByTagManual = db.prepare(`
  SELECT v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v JOIN channels c ON v.channel_id = c.id
  WHERE v.created_at > ? AND v.source_type = 'manual'
  ORDER BY v.created_at DESC, v.date DESC LIMIT 50`);
const stmtGetSinceReady = db.prepare(
  `${SEL} WHERE (v.video_status = 'ready' OR v.audio_status = 'ready') AND v.ready_at > ? ORDER BY v.ready_at DESC LIMIT 50`,
);
const stmtGetReady = db.prepare(
  `${SEL} WHERE v.video_status = 'ready' OR v.audio_status = 'ready' ORDER BY v.ready_at DESC LIMIT 200`,
);
const stmtExists = db.prepare(`SELECT id FROM videos WHERE youtube_id = ?`);
const stmtSetVideoStatus = db.prepare(
  `UPDATE videos SET video_status = ?, ready_at = CASE WHEN ? = 'ready' THEN strftime('%Y-%m-%dT%H:%M:%SZ','now') ELSE ready_at END WHERE youtube_id = ?`,
);
const stmtSetAudioStatus = db.prepare(
  `UPDATE videos SET audio_status = ?, ready_at = CASE WHEN ? = 'ready' THEN strftime('%Y-%m-%dT%H:%M:%SZ','now') ELSE ready_at END WHERE youtube_id = ?`,
);
const stmtSetDuration = db.prepare(
  `UPDATE videos SET duration = ? WHERE youtube_id = ? AND duration = 0`,
);
const stmtSetChapters = db.prepare(`UPDATE videos SET chapters_json = ? WHERE youtube_id = ?`);
const stmtInsert = db.prepare(`
  INSERT INTO videos (channel_id, youtube_id, title, date, duration, source_type)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (youtube_id) DO NOTHING
`);
const stmtGetStatusSummary = db.prepare(`
  WITH s(status) AS (VALUES ('none'), ('queued'), ('downloading'), ('ready'), ('expired'))
  SELECT
    s.status AS status,
    (SELECT COUNT(*) FROM videos WHERE video_status = s.status) AS video_count,
    (SELECT COUNT(*) FROM videos WHERE audio_status = s.status) AS audio_count
  FROM s
`);
const stmtGetProblemStatusRows = db.prepare(`
  SELECT youtube_id, title, video_status, audio_status,
         COALESCE(ready_at, '') AS ready_at, created_at
  FROM videos
  WHERE video_status IN ('queued', 'downloading', 'expired')
     OR audio_status IN ('queued', 'downloading', 'expired')
  ORDER BY created_at DESC
  LIMIT ?
`);
const stmtGetDownloadedVideos = db.prepare(`
  SELECT youtube_id, title, video_status, audio_status,
         COALESCE(ready_at, '') AS ready_at, created_at
  FROM videos
  WHERE video_status = 'ready' OR audio_status = 'ready'
  ORDER BY COALESCE(ready_at, created_at) DESC
  LIMIT ?
`);
const stmtDeleteVideoByYoutubeId = db.prepare(`DELETE FROM videos WHERE youtube_id = ?`);
const stmtSetVideoNone = db.prepare(`UPDATE videos SET video_status = 'none' WHERE youtube_id = ?`);
const stmtSetAudioNone = db.prepare(`UPDATE videos SET audio_status = 'none' WHERE youtube_id = ?`);

// ── Internal ──────────────────────────────────────────────────────────────────

type RawRow = {
  youtube_id: string;
  title: string;
  channel_id: number;
  channel_name: string;
  date: string;
  duration: number;
  video_status: string;
  audio_status: string;
  chapters_json: string;
};

type RawVideoStatusSummary = {
  status: string;
  video_count: number;
  audio_count: number;
};

type RawVideoStatusRow = {
  youtube_id: string;
  title: string;
  video_status: string;
  audio_status: string;
  ready_at: string;
  created_at: string;
};

type RawDownloadedVideoRow = {
  youtube_id: string;
  title: string;
  video_status: string;
  audio_status: string;
  ready_at: string;
  created_at: string;
};

function toRow(r: RawRow): VideoRow {
  return {
    youtubeId: r.youtube_id,
    title: r.title,
    channelId: r.channel_id,
    channelName: r.channel_name,
    date: r.date,
    duration: r.duration,
    videoStatus: r.video_status,
    audioStatus: r.audio_status,
    chapters: parseChaptersJson(r.chapters_json),
  };
}

function normalizeChapters(chapters: unknown): VideoChapter[] {
  if (!Array.isArray(chapters)) return [];

  return chapters
    .map((chapter) => {
      if (!chapter || typeof chapter !== 'object') return null;
      const row = chapter as { title?: unknown; start?: unknown; end?: unknown };
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      const start = typeof row.start === 'number' ? row.start : Number(row.start);
      const end = typeof row.end === 'number' ? row.end : Number(row.end);
      if (!title || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) {
        return null;
      }
      return {
        title,
        start: Math.floor(start),
        end: Math.floor(end),
      };
    })
    .filter((chapter): chapter is VideoChapter => chapter !== null);
}

function parseChaptersJson(value: string): VideoChapter[] {
  if (!value) return [];
  try {
    return normalizeChapters(JSON.parse(value));
  } catch {
    return [];
  }
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

export function getVideosByTag(tag: string): VideoRow[] {
  const rows =
    tag === 'manual' ? (stmtGetByTagManual.all() as RawRow[]) : (stmtGetByTag.all(tag) as RawRow[]);
  return rows.map(toRow);
}

export function getNewVideosSince(isoTimestamp: string): VideoRow[] {
  return (stmtGetSince.all(isoTimestamp) as RawRow[]).map(toRow);
}

export function getNewVideosSinceByChannel(isoTimestamp: string, channelId: number): VideoRow[] {
  return (stmtGetSinceByChannel.all(isoTimestamp, channelId) as RawRow[]).map(toRow);
}

export function getNewVideosSinceByTag(isoTimestamp: string, tag: string): VideoRow[] {
  const rows =
    tag === 'manual'
      ? (stmtGetSinceByTagManual.all(isoTimestamp) as RawRow[])
      : (stmtGetSinceByTag.all(isoTimestamp, tag) as RawRow[]);
  return rows.map(toRow);
}

export function getNewReadyVideosSince(isoTimestamp: string): VideoRow[] {
  return (stmtGetSinceReady.all(isoTimestamp) as RawRow[]).map(toRow);
}

export function getReadyVideos(): VideoRow[] {
  return (stmtGetReady.all() as RawRow[]).map(toRow);
}

export function videoExists(youtubeId: string): boolean {
  return !!stmtExists.get(youtubeId);
}

export function setVideoStatus(youtubeId: string, status: string): void {
  stmtSetVideoStatus.run(status, status, youtubeId);
}

export function setAudioStatus(youtubeId: string, status: string): void {
  stmtSetAudioStatus.run(status, status, youtubeId);
}

export function setDurationIfZero(youtubeId: string, duration: number): void {
  stmtSetDuration.run(duration, youtubeId);
}

export function setVideoChapters(youtubeId: string, chapters: VideoChapter[]): void {
  stmtSetChapters.run(JSON.stringify(normalizeChapters(chapters)), youtubeId);
}

export function insertVideos(
  entries: VideoEntry[],
  channelId: number,
  sourceType: string,
): string[] {
  const insertedYoutubeIds: string[] = [];
  db.exec('BEGIN');
  try {
    for (const e of entries) {
      const result = stmtInsert.run(
        channelId,
        e.youtubeId,
        e.title,
        e.date,
        e.duration ?? 0,
        sourceType,
      );
      if (result.changes > 0) insertedYoutubeIds.push(e.youtubeId);
    }
    db.exec('COMMIT');
    return insertedYoutubeIds;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getVideoStatusSummary(): VideoStatusSummary[] {
  return (stmtGetStatusSummary.all() as RawVideoStatusSummary[]).map((r) => ({
    status: r.status,
    videoCount: r.video_count,
    audioCount: r.audio_count,
  }));
}

export function getProblemStatusRows(limit = 200): VideoStatusRow[] {
  return (stmtGetProblemStatusRows.all(limit) as RawVideoStatusRow[]).map((r) => ({
    youtubeId: r.youtube_id,
    title: r.title,
    videoStatus: r.video_status,
    audioStatus: r.audio_status,
    readyAt: r.ready_at,
    createdAt: r.created_at,
  }));
}

export function getDownloadedVideos(limit = 300): DownloadedVideoRow[] {
  return (stmtGetDownloadedVideos.all(limit) as RawDownloadedVideoRow[]).map((r) => ({
    youtubeId: r.youtube_id,
    title: r.title,
    videoStatus: r.video_status,
    audioStatus: r.audio_status,
    readyAt: r.ready_at,
    createdAt: r.created_at,
  }));
}

export function deleteVideoByYoutubeId(youtubeId: string): boolean {
  const r = stmtDeleteVideoByYoutubeId.run(youtubeId);
  return r.changes > 0;
}

export function setMediaStatusesNone(
  youtubeId: string,
  opts: { video: boolean; audio: boolean },
): void {
  if (opts.video) stmtSetVideoNone.run(youtubeId);
  if (opts.audio) stmtSetAudioNone.run(youtubeId);
}
