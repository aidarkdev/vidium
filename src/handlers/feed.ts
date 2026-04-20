/**
 * handlers/feed.ts — GET / and /feed/:tag
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession, html } from '../lib/http.ts';
import { getAllVideos, getVideosByTag, getReadyVideos } from '../lib/video.ts';
import { getAllTags, getTagLabels } from '../lib/channel.ts';
import { renderFeedPage } from '../view/render.ts';
import { config } from '../config.ts';

export function handleFeed(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;

  const lang = session.data.lang ?? config.DEFAULT_LANG;
  const tag = params.tag ?? 'all';

  const cards =
    tag === 'all' ? getAllVideos() : tag === 'ready' ? getReadyVideos() : getVideosByTag(tag);
  const tags = getAllTags();
  const tagLabels = getTagLabels();

  html(res, renderFeedPage({ lang, cards, tags, tagLabels, activeTag: tag, since: Date.now() }));
}
