import {
  DEFAULT_VIDEO_PAGE_SIZE,
  getGuestVideoPage,
  getVideoPage,
  toPublicVideoRow,
} from '../../lib/video.ts';
import type { ViewerMode } from '../../lib/guest-access.ts';
import { t } from '../../pages/lang.ts';

interface FeedCardPagerBakeContext {
  id: string;
  lang: string;
  page?: number;
  activeTag?: string;
  activeChannelId?: number;
  syncUrl?: boolean;
  pageParam?: string;
  viewerMode?: ViewerMode;
  allowDownload?: boolean;
}

function strings(lang: string): Record<string, string> {
  return {
    watch: t(lang, 'card.watch'),
    listen: t(lang, 'card.listen'),
    downloadVideo: t(lang, 'card.download.video'),
    downloadAudio: t(lang, 'card.download.audio'),
    queued: t(lang, 'card.queued'),
    downloading: t(lang, 'card.downloading'),
    previous: t(lang, 'feed.page.previous'),
    next: t(lang, 'feed.page.next'),
    pagination: t(lang, 'feed.page.pagination'),
    loading: t(lang, 'feed.page.loading'),
    error: t(lang, 'feed.page.error'),
    pageStatus: t(lang, 'feed.page.status'),
  };
}

export function bakeFeedCardPager(ctx: FeedCardPagerBakeContext): {
  id: string;
  state: Record<string, unknown>;
} {
  const activeChannelId = ctx.activeChannelId ?? 0;
  const activeTag = ctx.activeTag ?? 'all';
  const query = {
    page: ctx.page ?? 1,
    pageSize: DEFAULT_VIDEO_PAGE_SIZE,
    tag: activeTag,
    channelId: activeChannelId,
  };
  const page = ctx.viewerMode === 'guest' ? getGuestVideoPage(query) : getVideoPage(query);

  return {
    id: ctx.id,
    state: {
      cards: page.items.map(toPublicVideoRow),
      page: page.page,
      pageSize: page.pageSize,
      pageCount: page.pageCount,
      total: page.total,
      activeTag,
      activeChannelId,
      allowDownload: ctx.allowDownload ?? true,
      pageParam: ctx.pageParam ?? 'page',
      syncUrl: ctx.syncUrl ?? true,
      loading: false,
      error: '',
      pollingIds: [],
      patchCardStatusUpdates: [],
      strings: strings(ctx.lang),
    },
  };
}
