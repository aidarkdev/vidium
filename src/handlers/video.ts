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

function renderPlayer(lang: string, title: string, channelName: string, mediaEl: string): string {
  return page({
    title,
    lang,
    body: `<div class="player">
  <button class="player-back" onclick="history.length > 1 ? history.back() : (location.href='/feed')">&larr; ${esc(t(lang, 'player.back'))}</button>
  ${mediaEl}
  <div class="player-title">
    ${channelName ? `<div class="player-channel">${esc(channelName)}</div>` : ''}
    <div class="player-title-text">${esc(title)}</div>
  </div>
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
    video.channelName,
    `<video id="video-player" controls autoplay preload="metadata" src="/media/v/${esc(id)}">Your browser does not support the video element.</video>
  <div class="audio-seek">
    <button onclick="seek(-30)">−30s</button>
    <button onclick="seek(-15)">−15s</button>
    <button id="audio-playpause" class="audio-playpause" onclick="togglePlay()">&#9654;</button>
    <button onclick="seek(15)">+15s</button>
    <button onclick="seek(30)">+30s</button>
  </div>
  <script>
function seek(s){var a=document.getElementById('video-player');a.currentTime=Math.max(0,a.currentTime+s);}
function togglePlay(){var a=document.getElementById('video-player');if(a.paused)a.play();else a.pause();}
(function(){var a=document.getElementById('video-player');var b=document.getElementById('audio-playpause');function sync(){b.innerHTML=a.paused?'&#9654;':'&#9646;&#9646;';}a.addEventListener('play',sync);a.addEventListener('pause',sync);sync();})();
  </script>`,
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
    video.channelName,
    `<img class="player-thumb" src="/t/${esc(id)}" alt="${esc(video.title)}">
  <audio id="audio-player" controls autoplay preload="metadata" src="/media/a/${esc(id)}">Your browser does not support the audio element.</audio>
  <div class="audio-seek">
    <button onclick="seek(-30)">−30s</button>
    <button onclick="seek(-15)">−15s</button>
    <button id="audio-playpause" class="audio-playpause" onclick="togglePlay()">&#9654;</button>
    <button onclick="seek(15)">+15s</button>
    <button onclick="seek(30)">+30s</button>
  </div>
  <script>
function seek(s){var a=document.getElementById('audio-player');a.currentTime=Math.max(0,a.currentTime+s);}
function togglePlay(){var a=document.getElementById('audio-player');if(a.paused)a.play();else a.pause();}
(function(){var a=document.getElementById('audio-player');var b=document.getElementById('audio-playpause');function sync(){b.innerHTML=a.paused?'&#9654;':'&#9646;&#9646;';}a.addEventListener('play',sync);a.addEventListener('pause',sync);sync();})();
  </script>`,
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
