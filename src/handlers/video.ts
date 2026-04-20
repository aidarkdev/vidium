/**
 * handlers/video.ts — player pages and media serving via X-Accel-Redirect.
 *
 * /v/:id        — HTML page with <video> player
 * /a/:id        — HTML page with <audio> player
 * /t/:id        — thumbnail image (X-Accel-Redirect)
 * /media/v/:id  — raw video file (X-Accel-Redirect)
 * /media/a/:id  — raw audio file (X-Accel-Redirect)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession, notFound } from '../lib/http.ts';
import { getVideoById } from '../lib/video.ts';
import { page } from '../view/page.ts';
import { esc } from '../view/esc.ts';
import { t } from '../view/lang.ts';

function accel(res: ServerResponse, path: string, contentType: string): void {
  res.writeHead(200, { 'Content-Type': contentType, 'X-Accel-Redirect': path });
  res.end();
}

function renderPlayer(lang: string, title: string, mediaEl: string): string {
  return page({
    title,
    lang,
    body: `<div class="player">
  ${mediaEl}
  <h1 class="player-title">${esc(title)}</h1>
  <button class="player-back" onclick="history.length > 1 ? history.back() : (location.href='/feed')">&larr; ${esc(t(lang, 'player.back'))}</button>
</div>`,
  });
}

// ── Player pages ─────────────────────────────────────────────────────────────

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
  const html = renderPlayer(
    lang,
    video.title,
    `<video controls autoplay preload="metadata" src="/media/v/${esc(id)}">Your browser does not support the video element.</video>`,
  );

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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
  const html = renderPlayer(
    lang,
    video.title,
    `<img class="player-thumb" src="/t/${esc(id)}" alt="${esc(video.title)}">
  <audio id="audio-player" controls autoplay preload="metadata" src="/media/a/${esc(id)}">Your browser does not support the audio element.</audio>
  <div class="audio-seek">
    <button onclick="seek(-30)">−30s</button>
    <button onclick="seek(-15)">−15s</button>
    <button onclick="seek(15)">+15s</button>
    <button onclick="seek(30)">+30s</button>
  </div>
  <script>function seek(s){var a=document.getElementById('audio-player');a.currentTime=Math.max(0,a.currentTime+s);}</script>`,
  );

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// ── Raw media (X-Accel-Redirect) ─────────────────────────────────────────────

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
