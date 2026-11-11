import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import {
  cinemaFileReady,
  cinemaPath,
  createCinemaVideo,
  deleteCinemaVideo,
  getCinemaVideo,
} from '../lib/cinema.ts';
import {
  checkCsrf,
  getOptionalSession,
  getQuery,
  html,
  json,
  NO_STORE,
  notFound,
  readBody,
  requireAdminApi,
  requireSession,
} from '../lib/http.ts';
import { isValidUid } from '../lib/validation.ts';
import { renderCinemaPage } from '../pages/cinema.ts';
import { renderPlayerPage } from '../pages/player.ts';

export function handleCinema(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) return;
  html(
    res,
    renderCinemaPage({
      lang: session.data.lang ?? config.DEFAULT_LANG,
      isAdmin: session.role === 'admin',
      page: Number(getQuery(req).page),
    }),
  );
}

export function handleCinemaPlayer(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;
  const page = renderPlayerPage({
    kind: 'video',
    cinema: true,
    lang: session.data.lang ?? config.DEFAULT_LANG,
    isAdmin: session.role === 'admin',
    params,
  });
  if (!page) return notFound(res);
  html(res, page);
}

export function handleCinemaMedia(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const uid = params.id ?? '';
  if (!getOptionalSession(req) || !getCinemaVideo(uid) || !cinemaFileReady(uid))
    return notFound(res);
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': NO_STORE,
    'X-Accel-Redirect': `/protected_media/cinema/${uid}.mp4`,
  });
  res.end();
}

async function mutation(
  req: IncomingMessage,
  res: ServerResponse,
  deleting: boolean,
): Promise<void> {
  if (!requireAdminApi(req, res) || !checkCsrf(req, res)) return;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
    if (
      deleting
        ? !isValidUid(body.uid)
        : typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 300
    )
      throw new Error('invalid input');
    if (Object.keys(body).some((key) => key !== (deleting ? 'uid' : 'title')))
      throw new Error('unexpected field');
  } catch {
    return json(res, 400, { error: 'invalid_input' });
  }
  try {
    if (deleting) {
      deleteCinemaVideo(body.uid as string);
      json(res, 200, { ok: true });
    } else {
      const video = createCinemaVideo((body.title as string).trim());
      json(res, 201, { ...video, expectedPath: cinemaPath(video.uid) });
    }
  } catch (error) {
    console.error('cinema mutation failed', error);
    json(res, 500, { error: 'cinema_failed' });
  }
}

export const handleCinemaCreate = (req: IncomingMessage, res: ServerResponse) =>
  mutation(req, res, false);
export const handleCinemaDelete = (req: IncomingMessage, res: ServerResponse) =>
  mutation(req, res, true);
