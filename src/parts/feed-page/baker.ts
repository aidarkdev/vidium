import { getAllChannels, getChannelById } from '../../lib/channel.ts';
import {
  getAllVideos,
  getReadyVideos,
  getVideosByChannel,
  getVideosByTag,
} from '../../lib/video.ts';
import { t } from '../../pages/lang.ts';

interface FeedBakeContext {
  lang: string;
  params: Record<string, string>;
}

type PageBakeResult =
  | { ok: true; id: string; title: string; state: Record<string, unknown> }
  | { ok: false; message: string };

type SuccessfulPageBake = Extract<PageBakeResult, { ok: true }>;

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

function labels(lang: string): Record<string, string> {
  return {
    all: t(lang, 'tag.all'),
    ready: t(lang, 'tag.ready'),
    moveUp: t(lang, 'sidebar.move_up'),
    moveDown: t(lang, 'sidebar.move_down'),
    save: t(lang, 'sidebar.save'),
  };
}

export function bakeFeedPage(ctx: FeedBakeContext): SuccessfulPageBake {
  const activeTag = ctx.params.tag ?? 'all';
  const cards =
    activeTag === 'all'
      ? getAllVideos()
      : activeTag === 'ready'
        ? getReadyVideos()
        : getVideosByTag(activeTag);
  const channels = getAllChannels();
  const manualCh = channels.find((ch) => ch.id === 1);
  const systemLabels: Record<string, string> = {
    all: t(ctx.lang, 'tag.all'),
    ready: t(ctx.lang, 'tag.ready'),
    manual: manualCh?.displayName || manualCh?.name || 'manual',
  };
  const title = systemLabels[activeTag] ?? activeTag;

  return {
    ok: true,
    id: 'feed-page',
    title: 'vidium',
    state: {
      title,
      cards,
      visibleCount: Math.min(21, cards.length),
      since: Date.now(),
      strings: cardStrings(ctx.lang),
      channels,
      activeTag,
      activeChannelId: 0,
      sidebarOpen: false,
      editMode: false,
      movingChannelId: 0,
      savingChannelNameId: 0,
      pollingIds: [],
      patchCardStatusUpdates: [],
      patchChannelDisplayNameUpdates: [],
      patchChannelOrderIds: [],
      labels: labels(ctx.lang),
    },
  };
}

export function bakeChannelPage(ctx: FeedBakeContext): PageBakeResult {
  const channelId = parseInt(ctx.params.id, 10);
  const channel = getChannelById(channelId);
  if (!channel) return { ok: false, message: 'Channel not found' };

  const cards = getVideosByChannel(channelId);
  const channels = getAllChannels();
  const title = channel.displayName || channel.name;

  return {
    ok: true,
    id: `channel-page-${channel.id}`,
    title,
    state: {
      title,
      cards,
      visibleCount: Math.min(21, cards.length),
      since: Date.now(),
      strings: cardStrings(ctx.lang),
      channels,
      activeTag: '',
      activeChannelId: channel.id,
      sidebarOpen: false,
      editMode: false,
      movingChannelId: 0,
      savingChannelNameId: 0,
      pollingIds: [],
      patchCardStatusUpdates: [],
      patchChannelDisplayNameUpdates: [],
      patchChannelOrderIds: [],
      labels: labels(ctx.lang),
    },
  };
}
