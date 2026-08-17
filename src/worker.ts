/**
 * worker.ts — background worker entry point.
 *
 * Startup:
 *   node --env-file=.env src/worker.ts
 */

import { existsSync } from 'node:fs';
import { config } from './config.ts';
import { enqueue, take, complete, fail, resetStale } from './lib/queue.ts';
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
} from './lib/video-mutations.ts';
import {
  getChannelById,
  getRssChannels,
  updateChannelYoutubeId,
  updateLastCrawled,
} from './lib/channel.ts';
import { processWorkerJob } from './worker-jobs.ts';
import { pollRss } from './worker-rss.ts';
import type { WorkerRuntimeDependencies, WorkerRuntime } from './worker-types.ts';
export type { WorkerRuntimeDependencies, WorkerRuntime } from './worker-types.ts';

const POLL_INTERVAL_MS = 2000;
const RSS_INTERVAL_MS = 30 * 60 * 1000;
const DISK_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

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

  async function runNextJob(): Promise<boolean> {
    if (stopping) return false;
    const job = dependencies.take();
    if (!job) return false;

    try {
      await processWorkerJob(dependencies, job.type, job.payload);
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

  function startRssPoll(): Promise<void> | undefined {
    if (stopping) return undefined;
    if (activePoll) return activePoll;
    activePoll = pollRss(dependencies, () => stopping)
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
