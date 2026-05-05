/**
 * handlers/video.ts — player pages and media serving via X-Accel-Redirect.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { requireSession, notFound, html } from '../lib/http.ts';
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

  const page = renderPlayerPage({
    kind: 'video',
    lang: session.data.lang ?? config.DEFAULT_LANG,
    params,
  });
  if (!page) return notFound(res);

  html(res, page);
}

export function handleAudio(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;

  const page = renderPlayerPage({
    kind: 'audio',
    lang: session.data.lang ?? config.DEFAULT_LANG,
    params,
  });
  if (!page) return notFound(res);

  html(res, page);
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
