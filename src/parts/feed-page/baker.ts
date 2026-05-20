import { getAllChannels, getAllTags, getChannelById, getTagLabel } from '../../lib/channel.ts';
import { t } from '../../pages/lang.ts';

interface FeedBakeContext {
  lang: string;
  params: Record<string, string>;
  sidebarMode?: 'channels' | 'tags';
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
  };
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
  };
}

export function bakeFeedPage(ctx: FeedBakeContext): SuccessfulPageBake {
  const activeTag = ctx.params.tag ?? 'all';
  const channels = getAllChannels();
  const tags = getAllTags();
  const manualCh = channels.find((ch) => ch.id === 1);
  const systemLabels: Record<string, string> = {
    all: t(ctx.lang, 'tag.all'),
    ready: t(ctx.lang, 'tag.ready'),
    manual: manualCh?.displayName || manualCh?.name || 'manual',
  };
  const title = systemLabels[activeTag] ?? getTagLabel(activeTag)?.label ?? activeTag;

  return {
    ok: true,
    id: 'feed-page',
    title: 'vidium',
    state: {
      title,
      strings: cardStrings(ctx.lang),
      channels,
      tags,
      activeTag,
      activeChannelId: 0,
      sidebarOpen: false,
      sidebarMode: ctx.sidebarMode ?? 'channels',
      editMode: false,
      movingChannelId: 0,
      movingTag: '',
      savingChannelNameId: 0,
      patchChannelDisplayNameUpdates: [],
      patchChannelOrderIds: [],
      patchTagOrderTags: [],
      labels: labels(ctx.lang),
    },
  };
}

export function bakeChannelPage(ctx: FeedBakeContext): PageBakeResult {
  const channelId = parseInt(ctx.params.id, 10);
  const channel = getChannelById(channelId);
  if (!channel) return { ok: false, message: 'Channel not found' };

  const channels = getAllChannels();
  const tags = getAllTags();
  const title = channel.displayName || channel.name;

  return {
    ok: true,
    id: `channel-page-${channel.id}`,
    title,
    state: {
      title,
      strings: cardStrings(ctx.lang),
      channels,
      tags,
      activeTag: '',
      activeChannelId: channel.id,
      sidebarOpen: false,
      sidebarMode: ctx.sidebarMode ?? 'channels',
      editMode: false,
      movingChannelId: 0,
      movingTag: '',
      savingChannelNameId: 0,
      patchChannelDisplayNameUpdates: [],
      patchChannelOrderIds: [],
      patchTagOrderTags: [],
      labels: labels(ctx.lang),
    },
  };
}
