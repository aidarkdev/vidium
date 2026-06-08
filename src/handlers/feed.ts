/**
 * handlers/feed.ts — GET / and /feed/:tag
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { parseCookies } from '../lib/auth/cookies.ts';
import { isGuestRestrictedFeedTag } from '../lib/feed-tags.ts';
import { getOptionalSession, html, getQuery, redirect } from '../lib/http.ts';
import { renderFeedPage } from '../pages/feed.ts';

function pageFromQuery(req: IncomingMessage): number {
  const page = Number.parseInt(getQuery(req).page ?? '1', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function handleFeed(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = getOptionalSession(req);
  const tag = params.tag?.trim();

  if (!session && tag && isGuestRestrictedFeedTag(tag)) {
    return redirect(res, '/feed');
  }

  html(
    res,
    renderFeedPage({
      lang: session?.data.lang ?? parseCookies(req).lang ?? config.DEFAULT_LANG,
      params,
      isAdmin: session?.role === 'admin',
      sidebarMode: session?.data.sidebarMode,
      page: pageFromQuery(req),
      viewerMode: session ? 'user' : 'guest',
    }),
  );
}
