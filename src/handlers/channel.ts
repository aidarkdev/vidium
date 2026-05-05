/**
 * handlers/channel.ts — GET /channel/:id
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { requireSession, notFound, html } from '../lib/http.ts';
import { renderChannelPage } from '../pages/channel.ts';

export function handleChannel(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;

  const page = renderChannelPage({
    lang: session.data.lang ?? config.DEFAULT_LANG,
    params,
  });
  if (!page) return notFound(res, 'Channel not found');

  html(res, page);
}
