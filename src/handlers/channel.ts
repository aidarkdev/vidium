/**
 * handlers/channel.ts — GET /channel/:id
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { parseCookies } from '../lib/auth/cookies.ts';
import { getOptionalSession, notFound, html, getQuery } from '../lib/http.ts';
import { renderChannelPage } from '../pages/channel.ts';

function pageFromQuery(req: IncomingMessage): number {
  const page = Number.parseInt(getQuery(req).page ?? '1', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function handleChannel(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = getOptionalSession(req);

  const page = renderChannelPage({
    lang: session?.data.lang ?? parseCookies(req).lang ?? config.DEFAULT_LANG,
    params,
    isAdmin: session?.role === 'admin',
    sidebarMode: session?.data.sidebarMode,
    page: pageFromQuery(req),
    viewerMode: session ? 'user' : 'guest',
  });
  if (!page) return notFound(res, 'Channel not found');

  html(res, page);
}
