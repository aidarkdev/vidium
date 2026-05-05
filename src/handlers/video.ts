/**
 * handlers/video.ts — player pages and media serving via X-Accel-Redirect.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession, notFound, html } from '../lib/http.ts';
import { getVideoById } from '../lib/video.ts';
import { t } from '../pages/lang.ts';
import { renderPlayerPage } from '../pages/player.ts';

function accel(res: ServerResponse, path: string, contentType: string): void {
  res.writeHead(200, { 'Content-Type': contentType, 'X-Accel-Redirect': path });
  res.end();
}

export function handleVideo(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;
  const id = params.id;
  if (!id) return notFound(res);
  const video = getVideoById(id);
  if (!video) return notFound(res);
  const lang = session.data.lang ?? 'en';
  html(
    res,
    renderPlayerPage(lang, `player-video-${id}`, {
      kind: 'video',
      title: video.title,
      channelName: video.channelName,
      mediaSrc: `/media/v/${id}`,
      backLabel: t(lang, 'player.back'),
      backRequested: 0,
      seekDelta: 0,
      seekRequested: 0,
      playRequested: 0,
      paused: true,
    }),
  );
}

export function handleAudio(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;
  const id = params.id;
  if (!id) return notFound(res);
  const video = getVideoById(id);
  if (!video) return notFound(res);
  const lang = session.data.lang ?? 'en';
  html(
    res,
    renderPlayerPage(lang, `player-audio-${id}`, {
      kind: 'audio',
      title: video.title,
      channelName: video.channelName,
      mediaSrc: `/media/a/${id}`,
      thumbSrc: `/t/${id}`,
      backLabel: t(lang, 'player.back'),
      backRequested: 0,
      seekDelta: 0,
      seekRequested: 0,
      playRequested: 0,
      paused: true,
    }),
  );
}

export function handleMediaVideo(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;
  const id = params.id;
  if (!id) return notFound(res);
  accel(res, `/protected_media/videos/${id}.mp4`, 'video/mp4');
}

export function handleMediaAudio(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;
  const id = params.id;
  if (!id) return notFound(res);
  accel(res, `/protected_media/audio/${id}.m4a`, 'audio/mp4');
}

export function handleThumb(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;
  const id = params.id;
  if (!id) return notFound(res);
  accel(res, `/protected_media/thumbs/${id}.jpg`, 'image/jpeg');
}
