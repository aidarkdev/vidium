/**
 * handlers/channel.ts — GET /channel/:id
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession, notFound, html } from '../lib/http.ts';
import { getChannelById } from '../lib/channel.ts';
import { getVideosByChannel, countVideosByChannel } from '../lib/video.ts';
import { renderChannelPage } from '../view/render.ts';
import { config } from '../config.ts';

export function handleChannel(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): void {
  const session = requireSession(req, res);
  if (!session) return;

  const channelId = parseInt(params.id, 10);
  const channel = getChannelById(channelId);
  if (!channel) return notFound(res, 'Channel not found');

  const lang = session.data.lang ?? config.DEFAULT_LANG;
  const cards = getVideosByChannel(channelId);
  const total = countVideosByChannel(channelId);

  html(
    res,
    renderChannelPage({
      lang,
      channelId: channel.id,
      channelName: channel.name,
      cards,
      hasMore: total > 100,
      since: Date.now(),
    }),
  );
}
