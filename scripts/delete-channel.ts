/**
 * delete-channel.ts — remove channel(s), their videos, media files, and related jobs.
 *
 * Usage:
 *   node --env-file=.env --experimental-sqlite scripts/delete-channel.ts 32
 *   node --env-file=.env --experimental-sqlite scripts/delete-channel.ts 12 13 16
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.ts';
import { db } from '../src/lib/db.ts';
import { MANUAL_CHANNEL_ID } from '../src/lib/channel.ts';

const channelIds = process.argv.slice(2).map((arg) => {
  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`invalid channel id: ${arg}`);
    process.exit(1);
  }
  return id;
});

if (channelIds.length === 0) {
  console.error('usage: delete-channel.ts <channel-id> [channel-id...]');
  process.exit(1);
}

function removeMediaFiles(youtubeIds: string[]): number {
  let removed = 0;
  for (const id of youtubeIds) {
    for (const rel of [`videos/${id}.mp4`, `audio/${id}.m4a`, `thumbs/${id}.jpg`]) {
      const path = join(config.MEDIA_DIR, rel);
      if (!existsSync(path)) continue;
      unlinkSync(path);
      removed++;
      console.log('removed', path);
    }
  }
  return removed;
}

for (const channelId of channelIds) {
  if (channelId <= MANUAL_CHANNEL_ID) {
    console.error(`refusing to delete system channel id=${channelId}`);
    process.exit(1);
  }

  const channel = db
    .prepare('SELECT id, name, display_name, url FROM channels WHERE id = ?')
    .get(channelId) as { id: number; name: string; display_name: string; url: string } | undefined;

  if (!channel) {
    console.log(`channel ${channelId}: not found, skipped`);
    continue;
  }

  const youtubeIds = (
    db.prepare('SELECT youtube_id FROM videos WHERE channel_id = ?').all(channelId) as {
      youtube_id: string;
    }[]
  ).map((row) => row.youtube_id);

  console.log('---', channel.id, channel.display_name || channel.name, channel.url);
  console.log('youtube_ids:', youtubeIds.length);

  const filesRemoved = removeMediaFiles(youtubeIds);
  const videosRemoved = db
    .prepare('DELETE FROM videos WHERE channel_id = ?')
    .run(channelId).changes;

  const jobsByYoutube = youtubeIds.length
    ? db
        .prepare(
          `DELETE FROM jobs
           WHERE json_extract(payload, '$.youtubeId') IN (
             SELECT value FROM json_each(?)
           )`,
        )
        .run(JSON.stringify(youtubeIds)).changes
    : 0;

  const crawlJobsRemoved = db
    .prepare(
      `DELETE FROM jobs
       WHERE type = 'crawl_channel' AND json_extract(payload, '$.channelId') = ?`,
    )
    .run(channelId).changes;

  const channelRemoved = db.prepare('DELETE FROM channels WHERE id = ?').run(channelId).changes;

  console.log({
    channelId,
    filesRemoved,
    videosRemoved,
    jobsByYoutube,
    crawlJobsRemoved,
    channelRemoved,
  });
}
