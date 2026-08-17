/**
 * video-queries.ts — read access layer for the videos table.
 */

import { db } from './db.ts';
import { FEED_TAG_ALL, normalizeGuestFeedTag } from './feed-tags.ts';

export const DEFAULT_VIDEO_PAGE_SIZE = 42;

export interface VideoRow {
  uid: string;
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

export interface VideoPageQuery {
  page: number;
  pageSize: number;
  tag?: string;
  channelId?: number;
}

export interface VideoPage {
  items: VideoRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

export type PublicVideoRow = Omit<VideoRow, 'youtubeId' | 'chapters'>;

const SEL = `
  SELECT v.uid, v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v LEFT JOIN channels c ON v.channel_id = c.id`;
const SEL_WITH_CHAPTERS = `
  SELECT v.uid, v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         v.chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v LEFT JOIN channels c ON v.channel_id = c.id`;
const GUEST_VISIBLE_WHERE = `c.guest_visible = 1`;

const stmtGetByYoutubeId = db.prepare(`${SEL_WITH_CHAPTERS} WHERE v.youtube_id = ?`);
const stmtGetByUid = db.prepare(`${SEL_WITH_CHAPTERS} WHERE v.uid = ?`);
const stmtCountAll = db.prepare(`SELECT COUNT(*) AS count FROM videos`);
const stmtGetAllPage = db.prepare(
  `${SEL} ORDER BY v.date DESC, v.created_at DESC LIMIT ? OFFSET ?`,
);
const stmtCountByChannel = db.prepare(`SELECT COUNT(*) AS count FROM videos WHERE channel_id = ?`);
const stmtGetByChannelPage = db.prepare(
  `${SEL} WHERE v.channel_id = ? ORDER BY v.date DESC, v.created_at DESC LIMIT ? OFFSET ?`,
);
const stmtCountByTag = db.prepare(`
  SELECT COUNT(*) AS count
  FROM videos v
  JOIN channel_tags ct ON ct.channel_id = v.channel_id
  WHERE ct.tag = ?`);
const stmtGetByTagPage = db.prepare(`
  SELECT v.uid, v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v
  JOIN channel_tags ct ON ct.channel_id = v.channel_id
  JOIN channels c ON v.channel_id = c.id
  WHERE ct.tag = ?
  ORDER BY v.date DESC, v.created_at DESC LIMIT ? OFFSET ?`);
const stmtCountByTagManual = db.prepare(
  `SELECT COUNT(*) AS count FROM videos WHERE source_type = 'manual'`,
);
const stmtGetByTagManualPage = db.prepare(`
  SELECT v.uid, v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v JOIN channels c ON v.channel_id = c.id
  WHERE v.source_type = 'manual'
  ORDER BY v.created_at DESC, v.date DESC LIMIT ? OFFSET ?`);
const stmtGetSince = db.prepare(
  `${SEL} WHERE v.created_at > ? ORDER BY v.date DESC, v.created_at DESC LIMIT 50`,
);
const stmtGetSinceByChannel = db.prepare(
  `${SEL} WHERE v.created_at > ? AND v.channel_id = ? ORDER BY v.date DESC, v.created_at DESC LIMIT 50`,
);
const stmtGetSinceByTag = db.prepare(`
  SELECT v.uid, v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v
  JOIN channel_tags ct ON ct.channel_id = v.channel_id
  JOIN channels c ON v.channel_id = c.id
  WHERE v.created_at > ? AND ct.tag = ?
  ORDER BY v.date DESC, v.created_at DESC LIMIT 50`);
const stmtGetSinceByTagManual = db.prepare(`
  SELECT v.uid, v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v JOIN channels c ON v.channel_id = c.id
  WHERE v.created_at > ? AND v.source_type = 'manual'
  ORDER BY v.created_at DESC, v.date DESC LIMIT 50`);
const stmtGetSinceReady = db.prepare(
  `${SEL} WHERE (v.video_status = 'ready' OR v.audio_status = 'ready') AND v.ready_at > ? ORDER BY v.ready_at DESC LIMIT 50`,
);
const stmtCountReady = db.prepare(
  `SELECT COUNT(*) AS count FROM videos WHERE video_status = 'ready' OR audio_status = 'ready'`,
);
const stmtGetReadyPage = db.prepare(
  `${SEL} WHERE v.video_status = 'ready' OR v.audio_status = 'ready' ORDER BY v.ready_at DESC LIMIT ? OFFSET ?`,
);
const stmtGuestCountAll = db.prepare(`
  SELECT COUNT(*) AS count
  FROM videos v JOIN channels c ON v.channel_id = c.id
  WHERE ${GUEST_VISIBLE_WHERE}`);
const stmtGuestGetAllPage = db.prepare(
  `${SEL} WHERE ${GUEST_VISIBLE_WHERE} ORDER BY v.date DESC, v.created_at DESC LIMIT ? OFFSET ?`,
);
const stmtGuestCountByChannel = db.prepare(`
  SELECT COUNT(*) AS count
  FROM videos v JOIN channels c ON v.channel_id = c.id
  WHERE v.channel_id = ? AND ${GUEST_VISIBLE_WHERE}`);
const stmtGuestGetByChannelPage = db.prepare(
  `${SEL} WHERE v.channel_id = ? AND ${GUEST_VISIBLE_WHERE} ORDER BY v.date DESC, v.created_at DESC LIMIT ? OFFSET ?`,
);
const stmtGuestCountByTag = db.prepare(`
  SELECT COUNT(*) AS count
  FROM videos v
  JOIN channel_tags ct ON ct.channel_id = v.channel_id
  JOIN channels c ON v.channel_id = c.id
  WHERE ct.tag = ? AND ${GUEST_VISIBLE_WHERE}`);
const stmtGuestGetByTagPage = db.prepare(`
  SELECT v.uid, v.youtube_id, v.title, v.channel_id, v.date, v.duration, v.video_status, v.audio_status,
         '[]' AS chapters_json,
         COALESCE(NULLIF(c.display_name,''), c.name, '') AS channel_name
  FROM videos v
  JOIN channel_tags ct ON ct.channel_id = v.channel_id
  JOIN channels c ON v.channel_id = c.id
  WHERE ct.tag = ? AND ${GUEST_VISIBLE_WHERE}
  ORDER BY v.date DESC, v.created_at DESC LIMIT ? OFFSET ?`);
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

type RawRow = {
  uid: string;
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

type RawCountRow = {
  count: number;
};

function toRow(r: RawRow): VideoRow {
  return {
    uid: r.uid,
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

function clampPage(page: number, pageSize: number, total: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
}

function offsetFor(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

function pageResult(rows: RawRow[], page: number, pageSize: number, total: number): VideoPage {
  return {
    items: rows.map(toRow),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

export function normalizeChapters(chapters: unknown): VideoChapter[] {
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

export function getVideoByYoutubeId(youtubeId: string): VideoRow | undefined {
  const r = stmtGetByYoutubeId.get(youtubeId) as RawRow | undefined;
  return r ? toRow(r) : undefined;
}

export function getVideoByUid(uid: string): VideoRow | undefined {
  const r = stmtGetByUid.get(uid) as RawRow | undefined;
  return r ? toRow(r) : undefined;
}

export function toPublicVideoRow(row: VideoRow): PublicVideoRow {
  return {
    uid: row.uid,
    title: row.title,
    channelId: row.channelId,
    channelName: row.channelName,
    date: row.date,
    duration: row.duration,
    videoStatus: row.videoStatus,
    audioStatus: row.audioStatus,
  };
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

export function getVideoPage(query: VideoPageQuery): VideoPage {
  const rawPageSize = Math.floor(query.pageSize);
  const rawPage = Math.floor(query.page);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 1;
  const requestedPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const channelId =
    typeof query.channelId === 'number' && Number.isInteger(query.channelId) ? query.channelId : 0;
  const tag = (query.tag ?? 'all').trim() || 'all';

  let total = 0;
  let rows: RawRow[] = [];

  if (channelId > 0) {
    total = (stmtCountByChannel.get(channelId) as RawCountRow).count;
    const page = clampPage(requestedPage, pageSize, total);
    rows = stmtGetByChannelPage.all(channelId, pageSize, offsetFor(page, pageSize)) as RawRow[];
    return pageResult(rows, page, pageSize, total);
  }

  if (tag === 'ready') {
    total = (stmtCountReady.get() as RawCountRow).count;
    const page = clampPage(requestedPage, pageSize, total);
    rows = stmtGetReadyPage.all(pageSize, offsetFor(page, pageSize)) as RawRow[];
    return pageResult(rows, page, pageSize, total);
  }

  if (tag === 'manual') {
    total = (stmtCountByTagManual.get() as RawCountRow).count;
    const page = clampPage(requestedPage, pageSize, total);
    rows = stmtGetByTagManualPage.all(pageSize, offsetFor(page, pageSize)) as RawRow[];
    return pageResult(rows, page, pageSize, total);
  }

  if (tag !== 'all') {
    total = (stmtCountByTag.get(tag) as RawCountRow).count;
    const page = clampPage(requestedPage, pageSize, total);
    rows = stmtGetByTagPage.all(tag, pageSize, offsetFor(page, pageSize)) as RawRow[];
    return pageResult(rows, page, pageSize, total);
  }

  total = (stmtCountAll.get() as RawCountRow).count;
  const page = clampPage(requestedPage, pageSize, total);
  rows = stmtGetAllPage.all(pageSize, offsetFor(page, pageSize)) as RawRow[];
  return pageResult(rows, page, pageSize, total);
}

export function getGuestVideoPage(query: VideoPageQuery): VideoPage {
  const rawPageSize = Math.floor(query.pageSize);
  const rawPage = Math.floor(query.page);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 1;
  const requestedPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const channelId =
    typeof query.channelId === 'number' && Number.isInteger(query.channelId) ? query.channelId : 0;
  const tag = normalizeGuestFeedTag((query.tag ?? FEED_TAG_ALL).trim() || FEED_TAG_ALL);

  let total = 0;
  let rows: RawRow[] = [];

  if (channelId > 0) {
    total = (stmtGuestCountByChannel.get(channelId) as RawCountRow).count;
    const page = clampPage(requestedPage, pageSize, total);
    rows = stmtGuestGetByChannelPage.all(
      channelId,
      pageSize,
      offsetFor(page, pageSize),
    ) as RawRow[];
    return pageResult(rows, page, pageSize, total);
  }

  if (tag !== FEED_TAG_ALL) {
    total = (stmtGuestCountByTag.get(tag) as RawCountRow).count;
    const page = clampPage(requestedPage, pageSize, total);
    rows = stmtGuestGetByTagPage.all(tag, pageSize, offsetFor(page, pageSize)) as RawRow[];
    return pageResult(rows, page, pageSize, total);
  }

  total = (stmtGuestCountAll.get() as RawCountRow).count;
  const page = clampPage(requestedPage, pageSize, total);
  rows = stmtGuestGetAllPage.all(pageSize, offsetFor(page, pageSize)) as RawRow[];
  return pageResult(rows, page, pageSize, total);
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
