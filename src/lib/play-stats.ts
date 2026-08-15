/**
 * play-stats.ts — bounded aggregate play counts with in-memory abuse controls.
 */

import { db } from './db.ts';

export type PlayKind = 'video' | 'audio';
export type PlayRecordResult = 'recorded' | 'deduplicated' | 'rate_limited' | 'not_found';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PLAYS_PER_ACTOR = 30;
const MAX_ACTORS = 10_000;

interface ActorWindow {
  count: number;
  resetAt: number;
  seen: Set<string>;
}

const actors = new Map<string, ActorWindow>();

const stmtRecord = db.prepare(`
  INSERT INTO video_play_counts (
    video_id, kind, play_count, first_played_at, last_played_at
  )
  SELECT
    id, ?, 1,
    strftime('%Y-%m-%dT%H:%M:%SZ','now'),
    strftime('%Y-%m-%dT%H:%M:%SZ','now')
  FROM videos
  WHERE uid = ?
  ON CONFLICT(video_id, kind) DO UPDATE SET
    play_count = video_play_counts.play_count + 1,
    last_played_at = excluded.last_played_at
`);

const stmtCountByUid = db.prepare(`
  SELECT COALESCE(SUM(c.play_count), 0) AS count
  FROM videos v
  LEFT JOIN video_play_counts c ON c.video_id = v.id
  WHERE v.uid = ?
    AND (? IS NULL OR c.kind = ?)
`);

const stmtPlayStatsRows = db.prepare(`
  SELECT v.uid, v.youtube_id, v.title, c.kind, c.play_count
  FROM video_play_counts c
  JOIN videos v ON v.id = c.video_id
  ORDER BY c.play_count DESC
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

function purgeExpiredActors(now: number): void {
  for (const [actor, entry] of actors) {
    if (now >= entry.resetAt) actors.delete(actor);
  }
}

function getActorWindow(actor: string, now: number): ActorWindow {
  const current = actors.get(actor);
  if (current && now < current.resetAt) return current;

  if (actors.size >= MAX_ACTORS) purgeExpiredActors(now);
  if (actors.size >= MAX_ACTORS) {
    const oldest = actors.keys().next().value as string | undefined;
    if (oldest !== undefined) actors.delete(oldest);
  }

  const fresh = { count: 0, resetAt: now + WINDOW_MS, seen: new Set<string>() };
  actors.set(actor, fresh);
  return fresh;
}

export function getPlayStatsRows(limit = 500): PlayStatsRow[] {
  return (stmtPlayStatsRows.all(limit) as RawPlayStatsRow[]).map((row) => ({
    uid: row.uid,
    youtubeId: row.youtube_id,
    title: row.title,
    kind: row.kind,
    playCount: row.play_count,
  }));
}

export function recordPlayEvent(
  uid: string,
  kind: PlayKind,
  actor: string,
  now = Date.now(),
): PlayRecordResult {
  const window = getActorWindow(actor, now);
  if (window.count >= MAX_PLAYS_PER_ACTOR) return 'rate_limited';
  window.count++;

  const playKey = `${uid}:${kind}`;
  if (window.seen.has(playKey)) return 'deduplicated';

  const result = stmtRecord.run(kind, uid);
  if (result.changes === 0) return 'not_found';

  window.seen.add(playKey);
  return 'recorded';
}

export function getPlayCountByUid(uid: string, kind?: PlayKind): number {
  const kindFilter = kind ?? null;
  const row = stmtCountByUid.get(uid, kindFilter, kindFilter) as { count: number };
  return row.count;
}
