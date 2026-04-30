/**
 * handlers/api.ts — JSON API endpoints.
 *
 * POST /api/download  — enqueue video or audio download
 * GET  /api/status    — poll job status for given youtube IDs
 * GET  /api/since     — new videos since a timestamp
 * POST /api/channel   — add channel + enqueue crawl
 * POST /api/video     — add single video by URL
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { unlink } from 'node:fs/promises';
import { config } from '../config.ts';
import { requireSessionApi, checkCsrf, readBody, getQuery, json } from '../lib/http.ts';
import { deleteJobById, deleteJobsByYoutubeId, enqueue } from '../lib/queue.ts';
import { isValidVideoId, CHANNEL_URL_RE, VIDEO_URL_RE } from '../lib/validation.ts';
import {
  deleteVideoByYoutubeId,
  getVideoById,
  videoExists,
  setVideoStatus,
  setAudioStatus,
  setMediaStatusesNone,
  insertVideos,
  getNewVideosSince,
  getNewVideosSinceByChannel,
  getNewVideosSinceByTag,
  getNewReadyVideosSince,
} from '../lib/video.ts';
import {
  addChannel,
  MANUAL_CHANNEL_ID,
  setTagLabel,
  moveChannel as moveChannelOrder,
} from '../lib/channel.ts';
import { fetchMeta } from '../lib/ytdlp.ts';

async function unlinkIfExists(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ENOENT') return false;
    throw err;
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { youtubeId: string; type: 'video' | 'audio' };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!isValidVideoId(data.youtubeId) || !['video', 'audio'].includes(data.type)) {
    return json(res, 400, { error: 'invalid request' });
  }

  const jobType = data.type === 'video' ? 'download_video' : 'download_audio';

  if (data.type === 'video') setVideoStatus(data.youtubeId, 'queued');
  else setAudioStatus(data.youtubeId, 'queued');
  enqueue(jobType, { youtubeId: data.youtubeId });

  json(res, 200, { ok: true, status: 'queued' });
}

export function handleStatus(req: IncomingMessage, res: ServerResponse): void {
  if (!requireSessionApi(req, res)) return;

  const ids = (getQuery(req).ids ?? '').split(',').filter(Boolean);
  if (!ids.length) return json(res, 200, {});

  const result: Record<string, { video: string; audio: string }> = {};
  for (const id of ids) {
    const v = getVideoById(id);
    if (v) result[id] = { video: v.videoStatus, audio: v.audioStatus };
  }

  json(res, 200, result);
}

export function handleSince(req: IncomingMessage, res: ServerResponse): void {
  if (!requireSessionApi(req, res)) return;

  const q = getQuery(req);
  const ts = parseInt(q.t ?? '0', 10);
  const sinceIso = new Date(Number.isFinite(ts) ? ts : 0).toISOString();
  const tag = (q.tag ?? '').trim();
  const channelId = Number.parseInt(q.channelId ?? '', 10);

  const rows = Number.isInteger(channelId) && channelId > 0
    ? getNewVideosSinceByChannel(sinceIso, channelId)
    : tag === 'ready'
      ? getNewReadyVideosSince(sinceIso)
      : tag && tag !== 'all'
        ? getNewVideosSinceByTag(sinceIso, tag)
        : getNewVideosSince(sinceIso);

  json(
    res,
    200,
    rows.map((r) => ({
      youtubeId: r.youtubeId,
      title: r.title,
      channelName: r.channelName,
      date: r.date,
      duration: r.duration,
      videoStatus: r.videoStatus,
      audioStatus: r.audioStatus,
    })),
  );
}

export async function handleAddChannel(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { url: string; tags?: string; displayName?: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!data.url || !CHANNEL_URL_RE.test(data.url)) {
    return json(res, 400, { error: 'invalid channel URL — use https://www.youtube.com/@name' });
  }

  const name = decodeURIComponent(data.url.match(/youtube\.com\/@([^/?#]+)/)?.[1] ?? '');
  const canonicalUrl = `https://www.youtube.com/@${name}`;
  const userTags = (data.tags ?? '')
    .replace(/[^a-zA-Z0-9,_-]/g, '')
    .split(',')
    .filter(Boolean);
  const displayName = (data.displayName ?? '').trim();
  const nameTag = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const tags = [...new Set([nameTag, ...userTags])].filter(Boolean).join(',');

  const { id, created } = addChannel(name, canonicalUrl, tags, displayName);
  if (!created) return json(res, 200, { ok: true, status: 'exists' });

  enqueue('crawl_channel', { channelId: id, url: canonicalUrl });
  if (data.url !== canonicalUrl) {
    enqueue('crawl_channel', { channelId: id, url: data.url });
  }

  json(res, 200, { ok: true, status: 'added', channelId: id });
}

export async function handleAddVideo(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { url: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  const match = (data.url ?? '').match(VIDEO_URL_RE);
  if (!match) return json(res, 400, { error: 'invalid YouTube video URL' });

  const youtubeId = match[1];
  if (videoExists(youtubeId)) return json(res, 200, { ok: true, status: 'exists' });

  let meta: { title: string; date: string; duration: number };
  try {
    meta = await fetchMeta(youtubeId);
  } catch {
    return json(res, 502, { error: 'failed to fetch video metadata' });
  }

  insertVideos(
    [{ youtubeId, title: meta.title, date: meta.date, duration: meta.duration }],
    MANUAL_CHANNEL_ID,
    'manual',
  );
  enqueue('download_thumbnail', { youtubeId });

  json(res, 200, { ok: true, status: 'added', youtubeId });
}

export async function handleSetTagLabel(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { tag: string; label: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!data.tag || typeof data.label !== 'string') {
    return json(res, 400, { error: 'invalid request' });
  }

  setTagLabel(data.tag, data.label.trim());
  json(res, 200, { ok: true });
}

export async function handleReorderChannel(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { channelId: number; direction: 'up' | 'down' };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (
    !Number.isInteger(data.channelId) ||
    data.channelId <= 1 ||
    !['up', 'down'].includes(data.direction)
  ) {
    return json(res, 400, { error: 'invalid request' });
  }

  const moved = moveChannelOrder(data.channelId, data.direction);
  json(res, 200, { ok: true, moved });
}

export async function handleAdminDeleteVideoFiles(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { youtubeId: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }
  if (!isValidVideoId(data.youtubeId)) return json(res, 400, { error: 'invalid request' });

  const videoDeleted = await unlinkIfExists(`${config.MEDIA_DIR}/videos/${data.youtubeId}.mp4`);
  const audioDeleted = await unlinkIfExists(`${config.MEDIA_DIR}/audio/${data.youtubeId}.m4a`);
  setMediaStatusesNone(data.youtubeId, { video: videoDeleted, audio: audioDeleted });

  json(res, 200, { ok: true, videoDeleted, audioDeleted });
}

export async function handleAdminDeleteVideo(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { youtubeId: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }
  if (!isValidVideoId(data.youtubeId)) return json(res, 400, { error: 'invalid request' });

  const videoDeleted = await unlinkIfExists(`${config.MEDIA_DIR}/videos/${data.youtubeId}.mp4`);
  const audioDeleted = await unlinkIfExists(`${config.MEDIA_DIR}/audio/${data.youtubeId}.m4a`);
  const videoRemoved = deleteVideoByYoutubeId(data.youtubeId);
  const jobsRemoved = deleteJobsByYoutubeId(data.youtubeId);

  json(res, 200, { ok: true, videoDeleted, audioDeleted, videoRemoved, jobsRemoved });
}

export async function handleAdminDeleteJob(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireSessionApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { jobId: number };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!Number.isInteger(data.jobId) || data.jobId <= 0) {
    return json(res, 400, { error: 'invalid request' });
  }

  const deleted = deleteJobById(data.jobId);
  json(res, 200, { ok: true, deleted });
}
