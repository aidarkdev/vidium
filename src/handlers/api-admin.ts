/** API handlers for administrative channel, video, tag, job, and user actions. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { unlink } from 'node:fs/promises';
import { config } from '../config.ts';
import { checkCsrf, json, readBody, requireAdminApi } from '../lib/http.ts';
import { setUserRole, type UserRole } from '../lib/auth/auth.ts';
import {
  deleteDownloadJobsByYoutubeId,
  deleteJobById,
  deleteJobsByYoutubeId,
  enqueue,
  getJobAdminById,
} from '../lib/queue.ts';
import { isValidVideoId, CHANNEL_URL_RE, VIDEO_URL_RE } from '../lib/validation.ts';
import {
  deleteVideoByYoutubeId,
  insertVideos,
  setAudioStatus,
  setMediaStatusesNone,
  setVideoStatus,
  videoExists,
} from '../lib/video-mutations.ts';
import { getVideoByYoutubeId } from '../lib/video-queries.ts';
import {
  MANUAL_CHANNEL_ID,
  addChannel,
  deleteTag,
  moveChannel as moveChannelOrder,
  moveTag as moveTagOrder,
  normalizeChannelTags,
  setChannelAutoDownload,
  setChannelDisplayName,
  setChannelGuestVisible,
  setChannelRssEnabled,
  setChannelTags,
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

export async function handleAddChannel(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdminApi(req, res)) return;
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
  const userTags = normalizeChannelTags(data.tags ?? '');
  const displayName = (data.displayName ?? '').trim();
  const tags = userTags.join(',');

  const { id, created } = addChannel(name, canonicalUrl, tags, displayName);
  if (!created) return json(res, 200, { ok: true, status: 'exists' });

  enqueue('crawl_channel', { channelId: id, url: canonicalUrl });
  if (data.url !== canonicalUrl) enqueue('crawl_channel', { channelId: id, url: data.url });

  json(res, 200, { ok: true, status: 'added', channelId: id });
}

export async function handleAddVideo(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdminApi(req, res)) return;
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

export async function handleSetChannelDisplayName(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { channelId: number; displayName: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (
    !Number.isInteger(data.channelId) ||
    data.channelId <= MANUAL_CHANNEL_ID ||
    typeof data.displayName !== 'string'
  ) {
    return json(res, 400, { error: 'invalid request' });
  }

  const saved = setChannelDisplayName(data.channelId, data.displayName.trim());
  json(res, 200, { ok: true, saved });
}

export async function handleSetChannelTags(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { channelId: number; tags: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (
    !Number.isInteger(data.channelId) ||
    data.channelId <= MANUAL_CHANNEL_ID ||
    typeof data.tags !== 'string'
  ) {
    return json(res, 400, { error: 'invalid request' });
  }

  const tags = normalizeChannelTags(data.tags).join(',');
  const saved = setChannelTags(data.channelId, tags);
  json(res, 200, { ok: true, saved, tags });
}

export async function handleSetChannelAutoDownload(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { channelId: number; type: 'video' | 'audio'; enabled: boolean };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (
    !Number.isInteger(data.channelId) ||
    data.channelId <= MANUAL_CHANNEL_ID ||
    !['video', 'audio'].includes(data.type) ||
    typeof data.enabled !== 'boolean'
  ) {
    return json(res, 400, { error: 'invalid request' });
  }

  const saved = setChannelAutoDownload(data.channelId, data.type, data.enabled);
  json(res, 200, { ok: true, saved, type: data.type, enabled: data.enabled });
}

export async function handleSetChannelGuestVisible(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { channelId: number; enabled: boolean };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (
    !Number.isInteger(data.channelId) ||
    data.channelId <= MANUAL_CHANNEL_ID ||
    typeof data.enabled !== 'boolean'
  ) {
    return json(res, 400, { error: 'invalid request' });
  }

  const saved = setChannelGuestVisible(data.channelId, data.enabled);
  json(res, 200, { ok: true, saved, enabled: data.enabled });
}

export async function handleSetChannelRssEnabled(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { channelId: number; enabled: boolean };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (
    !Number.isInteger(data.channelId) ||
    data.channelId <= MANUAL_CHANNEL_ID ||
    typeof data.enabled !== 'boolean'
  ) {
    return json(res, 400, { error: 'invalid request' });
  }

  const saved = setChannelRssEnabled(data.channelId, data.enabled);
  json(res, 200, { ok: true, saved, enabled: data.enabled });
}

export async function handleReorderChannel(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
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

export async function handleReorderTag(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { tag: string; direction: 'up' | 'down' };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  const tag = typeof data.tag === 'string' ? normalizeChannelTags(data.tag)[0] : '';
  if (!tag || tag !== data.tag || !['up', 'down'].includes(data.direction)) {
    return json(res, 400, { error: 'invalid request' });
  }

  const moved = moveTagOrder(data.tag, data.direction);
  json(res, 200, { ok: true, moved });
}

export async function handleDeleteTag(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { tag: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  const tag = typeof data.tag === 'string' ? normalizeChannelTags(data.tag)[0] : '';
  if (!tag || tag !== data.tag) return json(res, 400, { error: 'invalid request' });

  const deleted = deleteTag(data.tag);
  json(res, 200, { ok: true, deleted, tag: data.tag });
}

export async function handleAdminDeleteVideoFiles(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
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
  if (!requireAdminApi(req, res)) return;
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

type ResetStatusResult = { youtubeId: string; statusType: 'video' | 'audio' };
const RESETTABLE_MEDIA_STATUSES = new Set(['queued', 'downloading', 'expired']);

function resetDownloadJobStatus(jobId: number): ResetStatusResult | null {
  const job = getJobAdminById(jobId);
  if (!job || job.status === 'done' || !job.youtubeId) return null;

  const video = getVideoByYoutubeId(job.youtubeId);
  if (!video) return null;

  if (job.type === 'download_video') {
    if (!RESETTABLE_MEDIA_STATUSES.has(video.videoStatus)) return null;
    setVideoStatus(job.youtubeId, 'none');
    return { youtubeId: job.youtubeId, statusType: 'video' };
  }

  if (job.type === 'download_audio') {
    if (!RESETTABLE_MEDIA_STATUSES.has(video.audioStatus)) return null;
    setAudioStatus(job.youtubeId, 'none');
    return { youtubeId: job.youtubeId, statusType: 'audio' };
  }

  return null;
}

export async function handleAdminDeleteJob(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
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

  const resetStatus = resetDownloadJobStatus(data.jobId);
  const deleted = deleteJobById(data.jobId);
  json(res, 200, { ok: true, deleted, resetStatus });
}

export async function handleAdminResetVideoStatus(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAdminApi(req, res)) return;
  if (!checkCsrf(req, res)) return;

  let data: { youtubeId: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!isValidVideoId(data.youtubeId)) return json(res, 400, { error: 'invalid request' });

  const video = getVideoByYoutubeId(data.youtubeId);
  if (!video) return json(res, 404, { error: 'not found' });

  const resetVideo = RESETTABLE_MEDIA_STATUSES.has(video.videoStatus);
  const resetAudio = RESETTABLE_MEDIA_STATUSES.has(video.audioStatus);
  setMediaStatusesNone(data.youtubeId, { video: resetVideo, audio: resetAudio });
  const jobsRemoved = deleteDownloadJobsByYoutubeId(data.youtubeId);

  json(res, 200, {
    ok: true,
    resetStatus: { youtubeId: data.youtubeId, resetVideo, resetAudio },
    jobsRemoved,
  });
}

export async function handleAdminSetUserRole(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireAdminApi(req, res);
  if (!session) return;
  if (!checkCsrf(req, res)) return;

  let data: { userId: number; role: UserRole };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!Number.isInteger(data.userId) || !['user', 'admin'].includes(data.role)) {
    return json(res, 400, { error: 'invalid request' });
  }

  if (data.userId === session.userId && data.role !== 'admin') {
    return json(res, 403, { error: 'cannot change your own admin role' });
  }

  const saved = setUserRole(data.userId, data.role);
  json(res, 200, { ok: true, saved });
}
