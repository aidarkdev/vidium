/**
 * register-local-video.ts — registers an already uploaded MP4 in the database.
 *
 * The file must already exist at:
 *   MEDIA_DIR/videos/<id>.mp4
 *
 * Usage:
 *   node --env-file=.env scripts/register-local-video.ts local_demo "Video title"
 */

import { existsSync } from 'node:fs';
import { config } from '../src/config.ts';
import { db } from '../src/lib/db.ts';
import { generateVideoUid } from '../src/lib/video-mutations.ts';

const MEDIA_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MANUAL_CHANNEL_ID = 1;

const [youtubeId = '', ...titleParts] = process.argv.slice(2);
const title = titleParts.join(' ').trim();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!MEDIA_ID_RE.test(youtubeId)) {
  fail('invalid id: use only letters, digits, "_" and "-"; pass id without ".mp4"');
}

if (!title) {
  fail('missing title');
}

const filePath = `${config.MEDIA_DIR}/videos/${youtubeId}.mp4`;
if (!existsSync(filePath)) {
  fail(`missing file: ${filePath}`);
}

const date = new Date().toISOString().slice(0, 10);
const uid = generateVideoUid();
const stmt = db.prepare(`
  INSERT INTO videos (
    channel_id, uid, youtube_id, title, date, duration,
    video_status, audio_status, source_type, ready_at
  )
  VALUES (?, ?, ?, ?, ?, 0, 'ready', 'none', 'manual', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  ON CONFLICT (youtube_id) DO NOTHING
`);

const result = stmt.run(MANUAL_CHANNEL_ID, uid, youtubeId, title, date);
if (result.changes === 0) {
  fail(`video already exists: ${youtubeId}`);
}

console.log(`registered: ${youtubeId} -> /v/${uid}`);
