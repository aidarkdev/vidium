/**
 * worker.ts — background worker entry point.
 *
 * Startup:
 *   node --env-file=.env src/worker.ts
 */

import { existsSync } from 'node:fs';
import { config } from './config.ts';
import { enqueue, take, complete, fail, resetStale } from './lib/queue.ts';
import type { JobType } from './lib/queue.ts';
import {
  downloadVideo,
  downloadAudio,
  downloadThumb,
  crawlChannel,
  fetchChapters,
} from './lib/ytdlp.ts';
import { fetchFeed } from './lib/rss.ts';
import { checkDisk, type DeletedFile } from './lib/disk.ts';
import { purgeExpired } from './lib/auth/sessions.ts';
import {
  setVideoStatus,
  setAudioStatus,
  setDurationIfZero,
  insertVideos,
  setVideoChapters,
} from './lib/video.ts';
import {
  getChannelById,
  getRssChannels,
  updateChannelYoutubeId,
  updateLastCrawled,
} from './lib/channel.ts';

const POLL_INTERVAL_MS = 2000;
const RSS_INTERVAL_MS = 30 * 60 * 1000;
const RSS_CHANNEL_DELAY_MS = 1500;
const DISK_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

type WorkerJob = {
  id: number;
  type: string;
  payload: string;
};

type VideoEntry = {
  youtubeId: string;
  title: string;
  date: string;
  duration?: number;
};

type VideoChapter = {
  title: string;
  start: number;
  end: number;
};

type ChannelDownloadSettings = {
  autoDownloadVideo: boolean;
  autoDownloadAudio: boolean;
};

type RssChannel = ChannelDownloadSettings & {
  id: number;
  youtubeChannelId: string;
};

export interface WorkerRuntimeDependencies {
  mediaDir: string;
  crawlInitial: number;
  enqueue(type: JobType, payload: Record<string, unknown>): void;
  take(): WorkerJob | undefined;
  complete(id: number): void;
  fail(id: number, error: string): void;
  resetStale(): void;
  downloadVideo(youtubeId: string, destDir: string): Promise<number>;
  downloadAudio(youtubeId: string, destDir: string): Promise<number>;
  downloadThumb(youtubeId: string, destDir: string): Promise<void>;
  crawlChannel(
    channelUrl: string,
    start: number,
    end: number,
  ): Promise<{ channelYoutubeId: string; entries: VideoEntry[] }>;
  fetchChapters(youtubeId: string): Promise<VideoChapter[]>;
  fetchFeed(youtubeChannelId: string): Promise<VideoEntry[]>;
  existsSync(path: string): boolean;
  checkDisk(onDeleted: (file: DeletedFile) => void): Promise<void>;
  purgeExpired(): void;
  setVideoStatus(youtubeId: string, status: string): void;
  setAudioStatus(youtubeId: string, status: string): void;
  setDurationIfZero(youtubeId: string, duration: number): void;
  insertVideos(entries: VideoEntry[], channelId: number, sourceType: string): string[];
  setVideoChapters(youtubeId: string, chapters: VideoChapter[]): void;
  getChannelById(channelId: number): ChannelDownloadSettings | undefined;
  getRssChannels(): RssChannel[];
  updateChannelYoutubeId(channelId: number, youtubeChannelId: string): void;
  updateLastCrawled(channelId: number): void;
  setInterval(handler: () => void, timeout: number): unknown;
  clearInterval(id: unknown): void;
  sleep(ms: number): Promise<void>;
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(error: unknown): void;
}

export interface WorkerRuntime {
  start(): void;
  stop(signal: string): Promise<void>;
  runNextJob(): Promise<boolean>;
  startRssPoll(): Promise<void> | undefined;
}

const productionDependencies: WorkerRuntimeDependencies = {
  mediaDir: config.MEDIA_DIR,
  crawlInitial: config.CRAWL_INITIAL,
  enqueue,
  take,
  complete,
  fail,
  resetStale,
  downloadVideo,
  downloadAudio,
  downloadThumb,
  crawlChannel,
  fetchChapters,
  fetchFeed,
  existsSync,
  checkDisk,
  purgeExpired,
  setVideoStatus,
  setAudioStatus,
  setDurationIfZero,
  insertVideos,
  setVideoChapters,
  getChannelById,
  getRssChannels,
  updateChannelYoutubeId,
  updateLastCrawled,
  setInterval: (handler, timeout) => setInterval(handler, timeout),
  clearInterval: (id) => clearInterval(id),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  fatal: (err) => {
    console.error('job loop crashed:', err);
    process.exit(1);
  },
};

export function createWorkerRuntime(
  dependencies: WorkerRuntimeDependencies = productionDependencies,
): WorkerRuntime {
  let started = false;
  let stopping = false;
  let stopPromise: Promise<void> | undefined;
  let activeJobDrain: Promise<void> | undefined;
  let activePoll: Promise<void> | undefined;
  const intervalIds: unknown[] = [];

  function enqueueThumbsFor(youtubeIds: string[]): void {
    for (const youtubeId of youtubeIds) {
      dependencies.enqueue('download_thumbnail', { youtubeId });
    }
  }

  function enqueueAutoDownloadsFor(youtubeIds: string[], settings: ChannelDownloadSettings): void {
    for (const youtubeId of youtubeIds) {
      if (settings.autoDownloadVideo) {
        dependencies.setVideoStatus(youtubeId, 'queued');
        dependencies.enqueue('download_video', { youtubeId });
      }
      if (settings.autoDownloadAudio) {
        dependencies.setAudioStatus(youtubeId, 'queued');
        dependencies.enqueue('download_audio', { youtubeId });
      }
    }
  }

  async function refreshChaptersFor(youtubeId: string): Promise<void> {
    try {
      dependencies.setVideoChapters(youtubeId, await dependencies.fetchChapters(youtubeId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dependencies.error(`chapter fetch failed for ${youtubeId}:`, msg);
    }
  }

  async function processJob(type: string, payload: string): Promise<void> {
    const data = JSON.parse(payload);

    switch (type) {
      case 'download_video': {
        dependencies.setVideoStatus(data.youtubeId, 'downloading');
        try {
          const duration = await dependencies.downloadVideo(
            data.youtubeId,
            `${dependencies.mediaDir}/videos`,
          );
          dependencies.setVideoStatus(data.youtubeId, 'ready');
          if (duration > 0) dependencies.setDurationIfZero(data.youtubeId, duration);
          await refreshChaptersFor(data.youtubeId);
        } catch (err) {
          dependencies.setVideoStatus(data.youtubeId, 'none');
          throw err;
        }
        break;
      }

      case 'download_audio': {
        dependencies.setAudioStatus(data.youtubeId, 'downloading');
        try {
          const duration = await dependencies.downloadAudio(
            data.youtubeId,
            `${dependencies.mediaDir}/audio`,
          );
          dependencies.setAudioStatus(data.youtubeId, 'ready');
          if (duration > 0) dependencies.setDurationIfZero(data.youtubeId, duration);
          await refreshChaptersFor(data.youtubeId);
        } catch (err) {
          dependencies.setAudioStatus(data.youtubeId, 'none');
          throw err;
        }
        break;
      }

      case 'crawl_channel': {
        const result = await dependencies.crawlChannel(data.url, 1, dependencies.crawlInitial);
        const insertedYoutubeIds = dependencies.insertVideos(
          result.entries,
          data.channelId,
          'channel',
        );
        enqueueThumbsFor(insertedYoutubeIds);
        const channel = dependencies.getChannelById(data.channelId);
        if (channel) enqueueAutoDownloadsFor(insertedYoutubeIds, channel);
        if (result.channelYoutubeId) {
          dependencies.updateChannelYoutubeId(data.channelId, result.channelYoutubeId);
        }
        break;
      }

      case 'download_thumbnail': {
        const destDir = `${dependencies.mediaDir}/thumbs`;
        if (!dependencies.existsSync(`${destDir}/${data.youtubeId}.jpg`)) {
          await dependencies.downloadThumb(data.youtubeId, destDir);
        }
        break;
      }
    }
  }

  async function runNextJob(): Promise<boolean> {
    if (stopping) return false;
    const job = dependencies.take();
    if (!job) return false;

    try {
      await processJob(job.type, job.payload);
      dependencies.complete(job.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dependencies.fail(job.id, msg);
      dependencies.error(`job ${job.id} (${job.type}) failed:`, msg);
    }
    return true;
  }

  async function drainJobs(): Promise<void> {
    while (!stopping && (await runNextJob())) {
      // Drain pending jobs without waiting for the next idle poll interval.
    }
  }

  function startJobDrain(): void {
    if (stopping || activeJobDrain) return;
    activeJobDrain = drainJobs()
      .catch((err) => {
        dependencies.fatal(err);
      })
      .finally(() => {
        activeJobDrain = undefined;
      });
  }

  async function pollRss(): Promise<void> {
    const channels = dependencies.getRssChannels();
    for (let index = 0; index < channels.length; index++) {
      if (stopping) break;
      const channel = channels[index];
      try {
        const entries = await dependencies.fetchFeed(channel.youtubeChannelId);
        const insertedYoutubeIds = dependencies.insertVideos(entries, channel.id, 'channel');
        enqueueThumbsFor(insertedYoutubeIds);
        enqueueAutoDownloadsFor(insertedYoutubeIds, channel);
        dependencies.updateLastCrawled(channel.id);
      } catch (err) {
        dependencies.error(`RSS poll failed for channel ${channel.id}:`, err);
      }
      if (!stopping && index < channels.length - 1) {
        await dependencies.sleep(RSS_CHANNEL_DELAY_MS);
      }
    }
  }

  function startRssPoll(): Promise<void> | undefined {
    if (stopping) return undefined;
    if (activePoll) return activePoll;
    activePoll = pollRss()
      .catch((err) => {
        dependencies.error(err);
      })
      .finally(() => {
        activePoll = undefined;
      });
    return activePoll;
  }

  function start(): void {
    if (started || stopping) return;
    started = true;
    dependencies.resetStale();

    intervalIds.push(dependencies.setInterval(startJobDrain, POLL_INTERVAL_MS));
    intervalIds.push(dependencies.setInterval(() => void startRssPoll(), RSS_INTERVAL_MS));
    intervalIds.push(
      dependencies.setInterval(() => {
        if (stopping) return;
        dependencies
          .checkDisk(({ youtubeId, type }: DeletedFile) => {
            if (type === 'video') dependencies.setVideoStatus(youtubeId, 'none');
            else dependencies.setAudioStatus(youtubeId, 'none');
          })
          .catch((err) => dependencies.error(err));
      }, DISK_CHECK_INTERVAL_MS),
    );
    intervalIds.push(
      dependencies.setInterval(() => {
        if (!stopping) dependencies.purgeExpired();
      }, SESSION_PURGE_INTERVAL_MS),
    );

    startRssPoll();
    startJobDrain();
    dependencies.log('worker started');
  }

  function stop(signal: string): Promise<void> {
    if (stopPromise) return stopPromise;
    stopping = true;
    for (const intervalId of intervalIds) dependencies.clearInterval(intervalId);
    dependencies.log(`${signal} received; waiting for active work to finish`);

    stopPromise = Promise.allSettled([
      ...(activeJobDrain ? [activeJobDrain] : []),
      ...(activePoll ? [activePoll] : []),
    ]).then(() => {
      dependencies.log('worker stopped cleanly');
    });
    return stopPromise;
  }

  return { start, stop, runNextJob, startRssPoll };
}

if (import.meta.main) {
  const runtime = createWorkerRuntime();

  process.on('SIGTERM', () => {
    void runtime.stop('SIGTERM').then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void runtime.stop('SIGINT').then(() => process.exit(0));
  });

  runtime.start();
}
