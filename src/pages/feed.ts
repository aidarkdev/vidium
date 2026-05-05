import { t } from './lang.ts';
import { mountScript, renderPartPage } from './part-page.ts';
import type { VideoRow } from '../lib/video.ts';

interface ChannelRef {
  id: number;
  name: string;
  displayName: string;
}

interface FeedPageOptions {
  lang: string;
  cards: VideoRow[];
  tagLabels: Record<string, string>;
  activeTag: string;
  channels: ChannelRef[];
  since: number;
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

function feedState(opts: FeedPageOptions, title: string): Record<string, unknown> {
  return {
    title,
    cards: opts.cards,
    visibleCount: Math.min(21, opts.cards.length),
    since: opts.since,
    strings: cardStrings(opts.lang),
    channels: opts.channels,
    activeTag: opts.activeTag,
    activeChannelId: 0,
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

export function renderFeedPage(opts: FeedPageOptions): string {
  const manualCh = opts.channels.find((ch) => ch.id === 1);
  const systemLabels: Record<string, string> = {
    all: t(opts.lang, 'tag.all'),
    ready: t(opts.lang, 'tag.ready'),
    manual: manualCh?.displayName || manualCh?.name || 'manual',
  };
  const title = systemLabels[opts.activeTag] ?? opts.tagLabels[opts.activeTag] ?? opts.activeTag;
  const id = 'feed-page';

  return renderPartPage({
    lang: opts.lang,
    title: 'vidium',
    baked: { [id]: feedState(opts, title) },
    body: mountScript('/parts/feed-page/index.js', id),
  });
}
