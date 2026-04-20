/**
 * worker.ts — background worker entry point.
 *
 * Startup:
 *   node --env-file=.env src/worker.ts
 */

import { existsSync } from 'node:fs';
import { config } from './config.ts';
import { enqueue, take, complete, fail, resetStale } from './lib/queue.ts';
import { downloadVideo, downloadAudio, downloadThumb, crawlChannel } from './lib/ytdlp.ts';
import { fetchFeed } from './lib/rss.ts';
import { checkDisk, type DeletedFile } from './lib/disk.ts';
import { purgeExpired } from './lib/auth/sessions.ts';
import { setVideoStatus, setAudioStatus, setDurationIfZero, insertVideos } from './lib/video.ts';
import { getRssChannels, updateChannelYoutubeId, updateLastCrawled } from './lib/channel.ts';

const POLL_INTERVAL_MS = 2000;
const RSS_INTERVAL_MS = 30 * 60 * 1000;
const DISK_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function enqueueThumbsFor(entries: { youtubeId: string }[]): void {
  for (const e of entries) {
    enqueue('download_thumbnail', { youtubeId: e.youtubeId });
  }
}

// ── Job handlers ──────────────────────────────────────────────────────────────

async function processJob(_id: number, type: string, payload: string): Promise<void> {
  const data = JSON.parse(payload);

  switch (type) {
    case 'download_video': {
      setVideoStatus(data.youtubeId, 'downloading');
      try {
        const duration = await downloadVideo(data.youtubeId, `${config.MEDIA_DIR}/videos`);
        setVideoStatus(data.youtubeId, 'ready');
        if (duration > 0) setDurationIfZero(data.youtubeId, duration);
      } catch (err) {
        setVideoStatus(data.youtubeId, 'none');
        throw err;
      }
      break;
    }

    case 'download_audio': {
      setAudioStatus(data.youtubeId, 'downloading');
      try {
        const duration = await downloadAudio(data.youtubeId, `${config.MEDIA_DIR}/audio`);
        setAudioStatus(data.youtubeId, 'ready');
        if (duration > 0) setDurationIfZero(data.youtubeId, duration);
      } catch (err) {
        setAudioStatus(data.youtubeId, 'none');
        throw err;
      }
      break;
    }

    case 'crawl_channel': {
      const result = await crawlChannel(data.url, 1, config.CRAWL_INITIAL);
      insertVideos(result.entries, data.channelId, 'channel');
      enqueueThumbsFor(result.entries);
      if (result.channelYoutubeId) {
        updateChannelYoutubeId(data.channelId, result.channelYoutubeId);
      }
      break;
    }

    case 'download_thumbnail': {
      const destDir = `${config.MEDIA_DIR}/thumbs`;
      if (!existsSync(`${destDir}/${data.youtubeId}.jpg`)) {
        await downloadThumb(data.youtubeId, destDir);
      }
      break;
    }
  }
}

// ── RSS polling ───────────────────────────────────────────────────────────────

async function pollRss(): Promise<void> {
  for (const channel of getRssChannels()) {
    try {
      const entries = await fetchFeed(channel.youtubeChannelId);
      insertVideos(entries, channel.id, 'channel');
      enqueueThumbsFor(entries);
      updateLastCrawled(channel.id);
    } catch (err) {
      console.error(`RSS poll failed for channel ${channel.id}:`, err);
    }
    await sleep(1500);
  }
}

// ── Job loop ──────────────────────────────────────────────────────────────────

async function jobLoop(): Promise<void> {
  while (true) {
    const job = take();
    if (job) {
      try {
        await processJob(job.id, job.type, job.payload);
        complete(job.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(job.id, msg);
        console.error(`job ${job.id} (${job.type}) failed:`, msg);
      }
    } else {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Entry point ───────────────────────────────────────────────────────────────

resetStale();
console.log('worker started');

setInterval(() => {
  pollRss().catch(console.error);
}, RSS_INTERVAL_MS);
setInterval(() => {
  checkDisk(({ youtubeId, type }: DeletedFile) => {
    if (type === 'video') setVideoStatus(youtubeId, 'none');
    else setAudioStatus(youtubeId, 'none');
  }).catch(console.error);
}, DISK_CHECK_INTERVAL_MS);
setInterval(() => {
  purgeExpired();
}, 3600_000);

pollRss().catch(console.error);
jobLoop().catch((err) => {
  console.error('job loop crashed:', err);
  process.exit(1);
});
