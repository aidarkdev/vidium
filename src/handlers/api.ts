/**
 * handlers/api.ts — JSON API endpoints.
 *
 * POST /api/download  — enqueue video or audio download
 * GET  /api/status    — poll job status for given youtube IDs
 * GET  /api/since     — new videos since a timestamp
 * GET  /api/feed/cards — paginated feed card data
 * POST /api/channel   — add channel + enqueue crawl
 * POST /api/video     — add single video by URL
 * POST /api/channel/display-name — rename channel in sidebar
 * POST /api/tag/reorder — change tag order in sidebar
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { unlink } from 'node:fs/promises';
import { config } from '../config.ts';
import {
  getOptionalSession,
  requireSessionApi,
  requireAdminApi,
  checkCsrf,
  readBody,
  getQuery,
  json,
} from '../lib/http.ts';
import { setUserRole, type UserRole } from '../lib/auth/auth.ts';
import { updateSessionData } from '../lib/auth/sessions.ts';
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
  getVideoById,
  videoExists,
  setVideoStatus,
  setAudioStatus,
  setMediaStatusesNone,
  insertVideos,
  DEFAULT_VIDEO_PAGE_SIZE,
  getGuestVideoPage,
  getVideoPage,
  getNewVideosSince,
  getNewVideosSinceByChannel,
  getNewVideosSinceByTag,
  getNewReadyVideosSince,
} from '../lib/video.ts';
import {
  addChannel,
  deleteTag,
  MANUAL_CHANNEL_ID,
  setChannelDisplayName,
  setChannelAutoDownload,
  setChannelGuestVisible,
  setChannelTags,
  moveTag as moveTagOrder,
  moveChannel as moveChannelOrder,
  normalizeChannelTags,
} from '../lib/channel.ts';
import { getGuestVisibleVideo } from '../lib/guest-access.ts';
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

export async function handleSidebarMode(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = requireSessionApi(req, res);
  if (!session) return;
  if (!checkCsrf(req, res)) return;

  let data: { mode: string };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!['channels', 'tags'].includes(data.mode)) {
    return json(res, 400, { error: 'invalid request' });
  }

  updateSessionData(session.sid, {
    ...session.data,
    sidebarMode: data.mode as 'channels' | 'tags',
  });
  json(res, 200, { ok: true, mode: data.mode });
}

export function handleStatus(req: IncomingMessage, res: ServerResponse): void {
  const session = getOptionalSession(req);

  const ids = (getQuery(req).ids ?? '').split(',').filter(Boolean);
  if (!ids.length) return json(res, 200, {});

  const result: Record<string, { video: string; audio: string }> = {};
  for (const id of ids) {
    const v = session ? getVideoById(id) : getGuestVisibleVideo(id);
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

  const rows =
    Number.isInteger(channelId) && channelId > 0
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
      channelId: r.channelId,
      channelName: r.channelName,
      date: r.date,
      duration: r.duration,
      videoStatus: r.videoStatus,
      audioStatus: r.audioStatus,
    })),
  );
}

export function handleFeedCards(req: IncomingMessage, res: ServerResponse): void {
  const session = getOptionalSession(req);

  const q = getQuery(req);
  const page = Number.parseInt(q.page ?? '1', 10);
  const channelId = Number.parseInt(q.channelId ?? '', 10);
  const query = {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: DEFAULT_VIDEO_PAGE_SIZE,
    tag: (q.tag ?? 'all').trim() || 'all',
    channelId: Number.isInteger(channelId) && channelId > 0 ? channelId : 0,
  };
  const result = session ? getVideoPage(query) : getGuestVideoPage(query);

  json(res, 200, {
    ok: true,
    cards: result.items,
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
    total: result.total,
  });
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
  if (data.url !== canonicalUrl) {
    enqueue('crawl_channel', { channelId: id, url: data.url });
  }

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
  if (!tag || tag !== data.tag) {
    return json(res, 400, { error: 'invalid request' });
  }

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

  const video = getVideoById(job.youtubeId);
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

  const video = getVideoById(data.youtubeId);
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
