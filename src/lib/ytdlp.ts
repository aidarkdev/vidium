/**
 * ytdlp.ts — wrapper over yt-dlp binary.
 *
 * All functions return promises and reject on non-zero exit code.
 * Proxy and cookies are applied automatically from config when set.
 */

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { config } from '../config.ts';
import { isValidVideoId, parseDate } from './validation.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawEntry {
  id?: unknown;
  title?: unknown;
  upload_date?: unknown;
  duration?: unknown;
  webpage_url?: unknown;
}

export interface VideoMeta {
  youtubeId: string;
  title: string;
  date: string;
  duration: number;
}

export interface CrawlEntry {
  youtubeId: string;
  title: string;
  date: string;
  duration: number;
}

export interface CrawlResult {
  channelYoutubeId: string;
  entries: CrawlEntry[];
}

// ── Internal ──────────────────────────────────────────────────────────────────

function baseArgs(): string[] {
  const args: string[] = [];
  if (config.YTDLP_PROXY) args.push('--proxy', config.YTDLP_PROXY);
  if (config.YTDLP_COOKIES) args.push('--cookies', config.YTDLP_COOKIES);
  return args;
}

function run(args: string[], opts: { tolerant?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

    proc.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8').trim();
      const err = Buffer.concat(stderr).toString('utf8').trim();
      if (code === 0 || (opts.tolerant && out.length > 0)) {
        resolve(out);
      } else {
        reject(new Error(err || `yt-dlp exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Download video as MP4 ≤360p into destDir. Returns duration in seconds. */
export async function downloadVideo(youtubeId: string, destDir: string): Promise<number> {
  if (!isValidVideoId(youtubeId)) throw new Error(`invalid video ID: ${youtubeId}`);
  const out = await run([
    ...baseArgs(),
    '-f',
    '18/best[ext=mp4][height<=360]',
    '--merge-output-format',
    'mp4',
    '-o',
    `${destDir}/%(id)s.%(ext)s`,
    '--no-playlist',
    '-q',
    '--no-warnings',
    '--print',
    'after_move:%(duration)s',
    `https://www.youtube.com/watch?v=${youtubeId}`,
  ]);
  return parseInt(out.trim(), 10) || 0;
}

/** Download audio as M4A AAC into destDir. Returns duration in seconds. */
export async function downloadAudio(youtubeId: string, destDir: string): Promise<number> {
  if (!isValidVideoId(youtubeId)) throw new Error(`invalid video ID: ${youtubeId}`);
  const out = await run([
    ...baseArgs(),
    '-f',
    '140/bestaudio[ext=m4a]',
    '-o',
    `${destDir}/%(id)s.%(ext)s`,
    '--no-playlist',
    '-q',
    '--no-warnings',
    '--print',
    'after_move:%(duration)s',
    `https://www.youtube.com/watch?v=${youtubeId}`,
  ]);
  return parseInt(out.trim(), 10) || 0;
}

/** Download thumbnail from YouTube CDN into destDir as {youtubeId}.jpg. */
export async function downloadThumb(youtubeId: string, destDir: string): Promise<void> {
  if (!isValidVideoId(youtubeId)) throw new Error(`invalid video ID: ${youtubeId}`);
  const url = `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`thumbnail fetch failed: ${res.status} for ${youtubeId}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  await writeFile(`${destDir}/${youtubeId}.jpg`, bytes);
}

/** Fetch metadata for a single video without downloading. */
export async function fetchMeta(youtubeId: string): Promise<VideoMeta> {
  if (!isValidVideoId(youtubeId)) throw new Error(`invalid video ID: ${youtubeId}`);
  const raw = await run([
    ...baseArgs(),
    '--dump-single-json',
    '--no-playlist',
    '-q',
    '--no-warnings',
    `https://www.youtube.com/watch?v=${youtubeId}`,
  ]);
  const data = JSON.parse(raw);
  return {
    youtubeId: data.id as string,
    title: String(data.title ?? ''),
    date: parseDate(data.upload_date ?? ''),
    duration: typeof data.duration === 'number' ? data.duration : 0,
  };
}

/** Crawl a channel playlist (metadata only, no download). */
export async function crawlChannel(
  channelUrl: string,
  start: number,
  end: number,
): Promise<CrawlResult> {
  const TABS = ['videos', 'streams', 'shorts', 'playlists', 'featured'];
  const stripped = channelUrl.replace(/\/$/, '');
  const hasTab = TABS.some((t) => stripped.endsWith(`/${t}`));
  const url = hasTab ? stripped : `${stripped}/videos`;

  const raw = await run(
    [
      ...baseArgs(),
      '--skip-download',
      '--ignore-errors',
      '--no-warnings',
      '--quiet',
      '--playlist-items',
      `${start}:${end}`,
      '--dump-single-json',
      url,
    ],
    { tolerant: true },
  );

  const data = JSON.parse(raw) as { channel_id?: unknown; entries?: unknown[] };
  const entries = (data.entries ?? []) as RawEntry[];

  return {
    channelYoutubeId: typeof data.channel_id === 'string' ? data.channel_id : '',
    entries: entries
      .filter(
        (e) =>
          e != null &&
          isValidVideoId(String(e.id ?? '')) &&
          !String(e.webpage_url ?? '').includes('/shorts/'),
      )
      .map((e) => ({
        youtubeId: String(e.id),
        title: e.title != null ? String(e.title) : '',
        date: parseDate(e.upload_date != null ? String(e.upload_date) : ''),
        duration: typeof e.duration === 'number' ? e.duration : 0,
      })),
  };
}
