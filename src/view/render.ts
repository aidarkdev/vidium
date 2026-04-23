/**
 * render.ts — assembles full HTML pages with baked JSON for feed and channel views.
 */

import { page } from './page.ts';
import { esc } from './esc.ts';
import { t } from './lang.ts';
import type { VideoRow } from '../lib/video.ts';
import { renderAddFormsView } from './render/add-forms.view.ts';
import { renderBakedScript } from './render/baked-script.view.ts';
import { renderChannelBodyView } from './render/channel-body.view.ts';
import { renderFeedBodyView } from './render/feed-body.view.ts';
import { renderSidebarView } from './render/sidebar.view.ts';
import { renderTopbarView } from './render/topbar.view.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardData = VideoRow;

export interface ChannelRef {
  id: number;
  name: string;
  displayName: string;
}

export interface FeedPageOptions {
  lang: string;
  cards: CardData[];
  tags: string[];
  tagLabels: Record<string, string>;
  activeTag: string;
  channels: ChannelRef[];
  since: number; // unix ms timestamp of page render
}

export interface ChannelPageOptions {
  lang: string;
  channelId: number;
  channelName: string;
  cards: CardData[];
  hasMore: boolean;
  since: number;
  channels: ChannelRef[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bakedScript(cards: CardData[], lang: string, since: number): string {
  const strings = {
    watch: t(lang, 'card.watch'),
    listen: t(lang, 'card.listen'),
    downloadVideo: t(lang, 'card.download.video'),
    downloadAudio: t(lang, 'card.download.audio'),
    queued: t(lang, 'card.queued'),
    downloading: t(lang, 'card.downloading'),
    loadMore: t(lang, 'feed.load_more'),
  };
  const cardsJson = JSON.stringify(cards);
  const stringsJson = JSON.stringify(strings);
  const langJson = JSON.stringify(lang);

  return renderBakedScript(langJson, stringsJson, cardsJson, since);
}

function renderSidebar(
  channels: ChannelRef[],
  lang: string,
  activeChannelId?: number,
  activeTag?: string,
): string {
  const allLabel = t(lang, 'tag.all');
  const readyLabel = t(lang, 'tag.ready');
  const moveUpLabel = esc(t(lang, 'sidebar.move_up'));
  const moveDownLabel = esc(t(lang, 'sidebar.move_down'));
  const manualCh = channels.find((ch) => ch.id === 1);
  const manualLabel = esc(manualCh?.displayName || manualCh?.name || 'manual');
  const regularChannels = channels.filter((ch) => ch.id !== 1);

  return renderSidebarView({
    allLabel,
    readyLabel,
    manualLabel,
    allActive: activeTag === 'all',
    readyActive: activeTag === 'ready',
    manualActive: activeTag === 'manual',
    channels: regularChannels.map((ch) => ({
      id: ch.id,
      label: esc(ch.displayName || ch.name),
      active: ch.id === activeChannelId,
      moveUpLabel,
      moveDownLabel,
    })),
  });
}

function renderTopbar(_lang: string, label: string): string {
  return renderTopbarView(label);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderAddForms(lang: string): { navExtra: string; headScripts: string } {
  const addChannelLabel = t(lang, 'channel.add');
  const addChannelPlaceholder = esc(t(lang, 'channel.add.placeholder'));
  const addChannelDisplayNamePlaceholder = esc(t(lang, 'channel.add.display_name_placeholder'));
  const addChannelTagsPlaceholder = esc(t(lang, 'channel.add.tags_placeholder'));
  const addVideoLabel = t(lang, 'video.add');
  const addVideoPlaceholder = esc(t(lang, 'video.add.placeholder'));
  const editLabel = esc(t(lang, 'sidebar.edit'));

  const addStringsJson = JSON.stringify({
    added: t(lang, 'channel.added'),
    exists: t(lang, 'channel.exists'),
    error: t(lang, 'channel.error'),
  });
  const addVideoStringsJson = JSON.stringify({
    added: t(lang, 'video.added'),
    exists: t(lang, 'video.exists'),
    error: t(lang, 'video.error'),
  });

  const navExtra = renderAddFormsView({
    editLabel,
    addChannelLabel,
    addChannelPlaceholder,
    addChannelDisplayNamePlaceholder,
    addChannelTagsPlaceholder,
    addVideoLabel,
    addVideoPlaceholder,
  });

  const headScripts = [
    `<script>const ADD_STRINGS = ${addStringsJson};</script>`,
    `<script>const ADD_VIDEO_STRINGS = ${addVideoStringsJson};</script>`,
  ].join('\n');

  return { navExtra, headScripts };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function renderFeedPage(opts: FeedPageOptions): string {
  const { navExtra, headScripts: addHeadScripts } = renderAddForms(opts.lang);
  const headScripts = [bakedScript(opts.cards, opts.lang, opts.since), addHeadScripts].join('\n');

  const manualCh = opts.channels.find((ch) => ch.id === 1);
  const systemLabels: Record<string, string> = {
    all: t(opts.lang, 'tag.all'),
    ready: t(opts.lang, 'tag.ready'),
    manual: manualCh?.displayName || manualCh?.name || 'manual',
  };
  const currentLabel = systemLabels[opts.activeTag] ?? opts.tagLabels[opts.activeTag] ?? opts.activeTag;
  const sidebar = renderSidebar(opts.channels, opts.lang, undefined, opts.activeTag);

  const body = renderFeedBodyView(renderTopbar(opts.lang, esc(currentLabel)), sidebar);

  return page({
    title: 'vidium',
    lang: opts.lang,
    head: headScripts,
    navExtra,
    body,
    scripts: ['/static/js/card.js', '/static/js/add-channel.js', '/static/js/sidebar.js'],
  });
}

export function renderChannelPage(opts: ChannelPageOptions): string {
  const channelName = esc(opts.channelName);
  const loadMore = opts.hasMore
    ? `<button class="btn-more" id="btn-more" data-channel="${opts.channelId}">Load more</button>`
    : '';
  const sidebar = renderSidebar(opts.channels, opts.lang, opts.channelId);
  const { navExtra, headScripts: addHeadScripts } = renderAddForms(opts.lang);
  const headScripts = [bakedScript(opts.cards, opts.lang, opts.since), addHeadScripts].join('\n');

  const body = renderChannelBodyView(renderTopbar(opts.lang, channelName), sidebar, loadMore);

  return page({
    title: opts.channelName,
    lang: opts.lang,
    head: headScripts,
    navExtra,
    body,
    scripts: ['/static/js/card.js', '/static/js/add-channel.js', '/static/js/sidebar.js'],
  });
}
