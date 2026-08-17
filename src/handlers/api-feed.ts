/** API handlers for feed data, status polling, and session feed preferences. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { updateSessionData } from '../lib/auth/sessions.ts';
import {
  checkCsrf,
  getOptionalSession,
  getQuery,
  json,
  readBody,
  requireSessionApi,
} from '../lib/http.ts';
import { normalizeGuestFeedTag } from '../lib/feed-tags.ts';
import { getGuestVisibleVideo } from '../lib/guest-access.ts';
import { isValidUid } from '../lib/validation.ts';
import {
  DEFAULT_VIDEO_PAGE_SIZE,
  getGuestVideoPage,
  getNewReadyVideosSince,
  getNewVideosSince,
  getNewVideosSinceByChannel,
  getNewVideosSinceByTag,
  getVideoByUid,
  getVideoPage,
  toPublicVideoRow,
} from '../lib/video-queries.ts';

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
  for (const uid of ids) {
    if (!isValidUid(uid)) continue;
    const v = session ? getVideoByUid(uid) : getGuestVisibleVideo(uid);
    if (v) result[uid] = { video: v.videoStatus, audio: v.audioStatus };
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
    rows.map((r) => toPublicVideoRow(r)),
  );
}

export function handleFeedCards(req: IncomingMessage, res: ServerResponse): void {
  const session = getOptionalSession(req);

  const q = getQuery(req);
  const page = Number.parseInt(q.page ?? '1', 10);
  const channelId = Number.parseInt(q.channelId ?? '', 10);
  const rawTag = (q.tag ?? 'all').trim() || 'all';
  const query = {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: DEFAULT_VIDEO_PAGE_SIZE,
    tag: session ? rawTag : normalizeGuestFeedTag(rawTag),
    channelId: Number.isInteger(channelId) && channelId > 0 ? channelId : 0,
  };
  const result = session ? getVideoPage(query) : getGuestVideoPage(query);

  json(res, 200, {
    ok: true,
    cards: result.items.map(toPublicVideoRow),
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
    total: result.total,
  });
}
