/**
 * video-mutations.ts — write access layer for the videos table.
 */

import { randomBytes } from 'node:crypto';
import { db } from './db.ts';
import { normalizeChapters, type VideoChapter, type VideoEntry } from './video-queries.ts';

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
  INSERT INTO videos (channel_id, uid, youtube_id, title, date, duration, source_type)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (youtube_id) DO NOTHING
`);
const stmtDeleteVideoByYoutubeId = db.prepare(`DELETE FROM videos WHERE youtube_id = ?`);
const stmtSetVideoNone = db.prepare(`UPDATE videos SET video_status = 'none' WHERE youtube_id = ?`);
const stmtSetAudioNone = db.prepare(`UPDATE videos SET audio_status = 'none' WHERE youtube_id = ?`);

export function generateVideoUid(): string {
  return randomBytes(12).toString('base64url');
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
      let uid = generateVideoUid();
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = stmtInsert.run(
          channelId,
          uid,
          e.youtubeId,
          e.title,
          e.date,
          e.duration ?? 0,
          sourceType,
        );
        if (result.changes > 0) {
          insertedYoutubeIds.push(e.youtubeId);
          break;
        }
        if (videoExists(e.youtubeId)) break;
        uid = generateVideoUid();
      }
    }
    db.exec('COMMIT');
    return insertedYoutubeIds;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
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
