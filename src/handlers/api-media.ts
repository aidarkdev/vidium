/** API handlers for media queueing and play statistics. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkCsrf, getOptionalSession, json, readBody } from '../lib/http.ts';
import { getTrustedClientIp } from '../lib/client-ip.ts';
import { enqueue } from '../lib/queue.ts';
import { isValidUid } from '../lib/validation.ts';
import { getVideoByUid } from '../lib/video-queries.ts';
import { setAudioStatus, setVideoStatus } from '../lib/video-mutations.ts';
import { canGuestAccessVideo, getGuestVisibleVideo } from '../lib/guest-access.ts';
import { recordPlayEvent } from '../lib/play-stats.ts';

export async function handleDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = getOptionalSession(req);
  if (!checkCsrf(req, res)) return;

  let data: { uid: string; type: 'video' | 'audio' };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!isValidUid(data.uid) || !['video', 'audio'].includes(data.type)) {
    return json(res, 400, { error: 'invalid request' });
  }

  const video = session ? getVideoByUid(data.uid) : getGuestVisibleVideo(data.uid);
  if (!video) return json(res, 404, { error: 'not found' });

  const currentStatus = data.type === 'video' ? video.videoStatus : video.audioStatus;
  if (!['none', 'expired'].includes(currentStatus)) {
    return json(res, 200, { ok: true, status: currentStatus });
  }

  const jobType = data.type === 'video' ? 'download_video' : 'download_audio';

  if (data.type === 'video') setVideoStatus(video.youtubeId, 'queued');
  else setAudioStatus(video.youtubeId, 'queued');
  enqueue(jobType, { youtubeId: video.youtubeId });

  json(res, 200, { ok: true, status: 'queued' });
}

export async function handlePlay(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkCsrf(req, res)) return;

  let data: { uid: string; kind: 'video' | 'audio' };
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'invalid json' });
  }

  if (!isValidUid(data.uid) || !['video', 'audio'].includes(data.kind)) {
    return json(res, 400, { error: 'invalid request' });
  }

  const session = getOptionalSession(req);
  const video = session ? getVideoByUid(data.uid) : getGuestVisibleVideo(data.uid);
  if (!video) return json(res, 404, { error: 'not found' });
  if (!session && !canGuestAccessVideo(data.uid, data.kind)) {
    return json(res, 404, { error: 'not found' });
  }

  const actor = session ? `user:${session.userId}` : `guest:${getTrustedClientIp(req)}`;
  const result = recordPlayEvent(data.uid, data.kind, actor);
  if (result === 'not_found') return json(res, 404, { error: 'not found' });
  if (result === 'rate_limited') {
    res.setHeader('Retry-After', '3600');
    return json(res, 429, { error: 'rate limited' });
  }

  json(res, 200, { ok: true, recorded: result === 'recorded' });
}
