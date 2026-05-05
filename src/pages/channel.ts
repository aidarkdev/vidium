import { t } from './lang.ts';
import { mountScript, renderPartPage } from './part-page.ts';
import type { VideoRow } from '../lib/video.ts';

interface ChannelRef {
  id: number;
  name: string;
  displayName: string;
}

interface ChannelPageOptions {
  lang: string;
  channelId: number;
  channelName: string;
  cards: VideoRow[];
  since: number;
  channels: ChannelRef[];
}

function cardStrings(lang: string): Record<string, string> {
  return {
    watch: t(lang, 'card.watch'),
    listen: t(lang, 'card.listen'),
    downloadVideo: t(lang, 'card.download.video'),
    downloadAudio: t(lang, 'card.download.audio'),
    queued: t(lang, 'card.queued'),
    downloading: t(lang, 'card.downloading'),
    loadMore: t(lang, 'feed.load_more'),
  };
}

function channelState(opts: ChannelPageOptions): Record<string, unknown> {
  return {
    title: opts.channelName,
    cards: opts.cards,
    visibleCount: Math.min(21, opts.cards.length),
    since: opts.since,
    strings: cardStrings(opts.lang),
    channels: opts.channels,
    activeTag: '',
    activeChannelId: opts.channelId,
    sidebarOpen: false,
    editMode: false,
    movingChannelId: 0,
    pollingIds: [],
    labels: {
      all: t(opts.lang, 'tag.all'),
      ready: t(opts.lang, 'tag.ready'),
      moveUp: t(opts.lang, 'sidebar.move_up'),
      moveDown: t(opts.lang, 'sidebar.move_down'),
    },
  };
}

export function renderChannelPage(opts: ChannelPageOptions): string {
  const id = `channel-page-${opts.channelId}`;

  return renderPartPage({
    lang: opts.lang,
    title: opts.channelName,
    baked: { [id]: channelState(opts) },
    body: mountScript('/parts/feed-page/index.js', id),
  });
}
