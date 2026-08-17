import type { DeletedFile } from './lib/disk.ts';
import type { JobType } from './lib/queue.ts';
import type { VideoChapter, VideoEntry } from './lib/video-queries.ts';

export type WorkerJob = {
  id: number;
  type: string;
  payload: string;
};

export type ChannelDownloadSettings = {
  autoDownloadVideo: boolean;
  autoDownloadAudio: boolean;
};

export type RssChannel = ChannelDownloadSettings & {
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
