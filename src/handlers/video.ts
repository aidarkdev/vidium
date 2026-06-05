/**
 * handlers/video.ts — player pages and media serving via X-Accel-Redirect.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { parseCookies } from '../lib/auth/cookies.ts';
import { canGuestAccessVideo, getGuestVisibleVideo } from '../lib/guest-access.ts';
import { getVideoByUid } from '../lib/video.ts';
import { getOptionalSession, notFound, html, NO_STORE } from '../lib/http.ts';
import { renderPlayerPage } from '../pages/player.ts';

function accel(res: ServerResponse, path: string, contentType: string): void {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': NO_STORE,
    'X-Accel-Redirect': path,
  });
  res.end();
}

export function handleVideo(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = getOptionalSession(req);
  if (!session && !canGuestAccessVideo(params.id ?? '', 'video')) return notFound(res);

  const page = renderPlayerPage({
    kind: 'video',
    lang: session?.data.lang ?? parseCookies(req).lang ?? config.DEFAULT_LANG,
    params,
    isAdmin: session?.role === 'admin',
    isGuest: !session,
  });
  if (!page) return notFound(res);

  html(res, page);
}

export function handleAudio(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = getOptionalSession(req);
  if (!session && !canGuestAccessVideo(params.id ?? '', 'audio')) return notFound(res);

  const page = renderPlayerPage({
    kind: 'audio',
    lang: session?.data.lang ?? parseCookies(req).lang ?? config.DEFAULT_LANG,
    params,
    isAdmin: session?.role === 'admin',
    isGuest: !session,
  });
  if (!page) return notFound(res);

  html(res, page);
}

export function handleMediaVideo(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = getOptionalSession(req);
  const uid = params.id;
  if (!uid) return notFound(res);
  if (!session && !canGuestAccessVideo(uid, 'video')) return notFound(res);
  const video = getVideoByUid(uid);
  if (!video) return notFound(res);
  accel(res, `/protected_media/videos/${video.youtubeId}.mp4`, 'video/mp4');
}

export function handleMediaAudio(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = getOptionalSession(req);
  const uid = params.id;
  if (!uid) return notFound(res);
  if (!session && !canGuestAccessVideo(uid, 'audio')) return notFound(res);
  const video = getVideoByUid(uid);
  if (!video) return notFound(res);
  accel(res, `/protected_media/audio/${video.youtubeId}.m4a`, 'audio/mp4');
}

export function handleThumb(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = getOptionalSession(req);
  const uid = params.id;
  if (!uid) return notFound(res);
  const video = session ? getVideoByUid(uid) : getGuestVisibleVideo(uid);
  if (!video) return notFound(res);
  accel(res, `/protected_media/thumbs/${video.youtubeId}.jpg`, 'image/jpeg');
}
