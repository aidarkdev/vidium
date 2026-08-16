import {
  getAllChannels,
  getAllTags,
  getChannelById,
  getGuestVisibleChannels,
  getGuestVisibleTags,
  getTagLabel,
} from '../../lib/channel.ts';
import {
  FEED_TAG_ALL,
  FEED_TAG_MANUAL,
  FEED_TAG_READY,
  isCustomFeedTag,
} from '../../lib/feed-tags.ts';
import type { ViewerMode } from '../../lib/guest-access.ts';
import { t } from '../../pages/lang.ts';

interface FeedBakeContext {
  lang: string;
  params: Record<string, string>;
  sidebarMode?: 'channels' | 'tags';
  viewerMode?: ViewerMode;
}

type PageBakeResult = { ok: true; id: string; state: Record<string, unknown> } | { ok: false };

type SuccessfulPageBake = Extract<PageBakeResult, { ok: true }>;

interface SystemFeedLink {
  href: string;
  tag: string;
  label: string;
}

function labels(lang: string): Record<string, string> {
  return {
    all: t(lang, 'tag.all'),
    ready: t(lang, 'tag.ready'),
    moveUp: t(lang, 'sidebar.move_up'),
    moveDown: t(lang, 'sidebar.move_down'),
    save: t(lang, 'sidebar.save'),
    channels: t(lang, 'sidebar.channels'),
    tags: t(lang, 'sidebar.tags'),
    deleteTag: t(lang, 'sidebar.delete_tag'),
    confirmDeleteTag: t(lang, 'sidebar.confirm_delete_tag'),
    actionError: t(lang, 'feed.action.error'),
  };
}

function manualChannelLabel(): string {
  const manual = getChannelById(1);
  return manual?.displayName || manual?.name || FEED_TAG_MANUAL;
}

function systemFeedLinks(lang: string, isGuest: boolean): SystemFeedLink[] {
  const links: SystemFeedLink[] = [{ href: '/feed', tag: FEED_TAG_ALL, label: t(lang, 'tag.all') }];
  if (!isGuest) {
    links.push(
      { href: '/feed/ready', tag: FEED_TAG_READY, label: t(lang, 'tag.ready') },
      { href: '/feed/manual', tag: FEED_TAG_MANUAL, label: manualChannelLabel() },
    );
  }
  return links;
}

function resolveSidebarMode(
  ctx: FeedBakeContext,
  activeTag: string,
  activeChannelId: number,
): 'channels' | 'tags' {
  if (activeChannelId > 0) return 'channels';
  if (isCustomFeedTag(activeTag)) return 'tags';
  return ctx.sidebarMode ?? 'channels';
}

function feedTitle(lang: string, activeTag: string): string {
  if (activeTag === FEED_TAG_ALL) return t(lang, 'tag.all');
  if (activeTag === FEED_TAG_READY) return t(lang, 'tag.ready');
  if (activeTag === FEED_TAG_MANUAL) return manualChannelLabel();
  return getTagLabel(activeTag)?.label ?? activeTag;
}

function sharedFeedState(ctx: FeedBakeContext, activeTag: string, activeChannelId: number) {
  const isGuest = ctx.viewerMode === 'guest';

  return {
    channels: isGuest ? getGuestVisibleChannels() : getAllChannels(),
    tags: isGuest ? getGuestVisibleTags() : getAllTags(),
    activeTag,
    activeChannelId,
    sidebarOpen: false,
    sidebarMode: resolveSidebarMode(ctx, activeTag, activeChannelId),
    systemFeedLinks: systemFeedLinks(ctx.lang, isGuest),
    persistSidebarMode: !isGuest,
    editMode: false,
    movingChannelId: 0,
    movingTag: '',
    savingChannelNameId: 0,
    actionError: '',
    eventNavigateFeed: 0,
    patchChannelDisplayNameUpdates: [],
    patchChannelOrderIds: [],
    patchTagOrderTags: [],
    labels: labels(ctx.lang),
  };
}

export function bakeFeedPage(ctx: FeedBakeContext): SuccessfulPageBake {
  const activeTag = ctx.params.tag ?? FEED_TAG_ALL;

  return {
    ok: true,
    id: 'feed-page',
    state: {
      title: feedTitle(ctx.lang, activeTag),
      ...sharedFeedState(ctx, activeTag, 0),
    },
  };
}

export function bakeChannelPage(ctx: FeedBakeContext): PageBakeResult {
  const isGuest = ctx.viewerMode === 'guest';
  const channelId = parseInt(ctx.params.id, 10);
  const channel = getChannelById(channelId);
  if (!channel) return { ok: false };
  if (isGuest && !channel.guestVisible) return { ok: false };

  const title = channel.displayName || channel.name;

  return {
    ok: true,
    id: `channel-page-${channel.id}`,
    state: {
      title,
      ...sharedFeedState(ctx, '', channel.id),
    },
  };
}
