/**
 * handlers/feed.ts — GET / and /feed/:tag
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { requireSession, html } from '../lib/http.ts';
import { renderFeedPage } from '../pages/feed.ts';

export function handleFeed(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;

  html(
    res,
    renderFeedPage({
      lang: session.data.lang ?? config.DEFAULT_LANG,
      params,
      isAdmin: session.role === 'admin',
      sidebarMode: session.data.sidebarMode,
    }),
  );
}
