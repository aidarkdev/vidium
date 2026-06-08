/**
 * play-stats.ts — records and queries player page play events.
 */

import { db } from './db.ts';
import { getVideoByUid } from './video.ts';

export type PlayKind = 'video' | 'audio';

const stmtInsert = db.prepare(`
  INSERT INTO video_play_events (video_id, kind)
  SELECT id, ? FROM videos WHERE uid = ?
`);

const stmtCountByUid = db.prepare(`
  SELECT COUNT(*) AS count
  FROM video_play_events e
  JOIN videos v ON v.id = e.video_id
  WHERE v.uid = ?
    AND (? IS NULL OR e.kind = ?)
`);

const stmtEventsByUid = db.prepare(`
  SELECT e.played_at
  FROM video_play_events e
  JOIN videos v ON v.id = e.video_id
  WHERE v.uid = ?
    AND (? IS NULL OR e.kind = ?)
  ORDER BY e.played_at DESC
  LIMIT ?
`);

const stmtPlayStatsRows = db.prepare(`
  SELECT v.uid, v.youtube_id, v.title, e.kind, COUNT(*) AS play_count
  FROM video_play_events e
  JOIN videos v ON v.id = e.video_id
  GROUP BY e.video_id, e.kind
  ORDER BY play_count DESC
  LIMIT ?
`);

export interface PlayStatsRow {
  uid: string;
  youtubeId: string;
  title: string;
  kind: PlayKind;
  playCount: number;
}

type RawPlayStatsRow = {
  uid: string;
  youtube_id: string;
  title: string;
  kind: PlayKind;
  play_count: number;
};

export function getPlayStatsRows(limit = 500): PlayStatsRow[] {
  return (stmtPlayStatsRows.all(limit) as RawPlayStatsRow[]).map((row) => ({
    uid: row.uid,
    youtubeId: row.youtube_id,
    title: row.title,
    kind: row.kind,
    playCount: row.play_count,
  }));
}

export function recordPlayEvent(uid: string, kind: PlayKind): boolean {
  const result = stmtInsert.run(kind, uid);
  return result.changes > 0;
}

export function getPlayCountByUid(uid: string, kind?: PlayKind): number {
  if (!getVideoByUid(uid)) return 0;
  const kindFilter = kind ?? null;
  const row = stmtCountByUid.get(uid, kindFilter, kindFilter) as { count: number };
  return row.count;
}

export function getPlayEventsByUid(uid: string, kind?: PlayKind, limit = 100): string[] {
  if (!getVideoByUid(uid)) return [];
  const kindFilter = kind ?? null;
  return (stmtEventsByUid.all(uid, kindFilter, kindFilter, limit) as { played_at: string }[]).map(
    (row) => row.played_at,
  );
}
