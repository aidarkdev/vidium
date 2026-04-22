/**
 * render.ts — assembles full HTML pages with baked JSON for feed and channel views.
 */

import { page } from './page.ts';
import { esc } from './esc.ts';
import { t } from './lang.ts';
import type { VideoRow } from '../lib/video.ts';

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

  return `<script>
const UI_LANG = ${langJson};
const UI_STRINGS = ${stringsJson};
const CARDS = ${cardsJson};
const SINCE = ${since};
</script>`;
}

function renderSidebar(
  channels: ChannelRef[],
  lang: string,
  activeChannelId?: number,
  activeTag?: string,
): string {
  const allLabel = t(lang, 'tag.all');
  const readyLabel = t(lang, 'tag.ready');
  const manualCh = channels.find((ch) => ch.id === 1);
  const manualLabel = esc(manualCh?.displayName || manualCh?.name || 'manual');
  const regularChannels = channels.filter((ch) => ch.id !== 1);

  const allActive = activeTag === 'all' ? ' class="active"' : '';
  const readyActive = activeTag === 'ready' ? ' class="active"' : '';
  const manualActive = activeTag === 'manual' ? ' class="active"' : '';

  const systemLinks = `<a href="/feed"${allActive}>${allLabel}</a>
<a href="/feed/ready"${readyActive}>${readyLabel}</a>
<a href="/feed/manual"${manualActive}>${manualLabel}</a>`;

  const channelLinks = regularChannels
    .map((ch) => {
      const label = esc(ch.displayName || ch.name);
      const active = ch.id === activeChannelId ? ' class="active"' : '';
      return `<a href="/channel/${ch.id}"${active}>${label}</a>`;
    })
    .join('\n');

  return `<div class="sidebar-panel" id="sidebar-panel">
  <div class="sidebar-system">${systemLinks}</div>
  <div class="sidebar-divider"></div>
  <div class="sidebar-channels">${channelLinks}</div>
</div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderAddForms(lang: string): { navExtra: string; headScripts: string } {
  const addChannelLabel = t(lang, 'channel.add');
  const addChannelPlaceholder = esc(t(lang, 'channel.add.placeholder'));
  const addChannelTagsPlaceholder = esc(t(lang, 'channel.add.tags_placeholder'));
  const addVideoLabel = t(lang, 'video.add');
  const addVideoPlaceholder = esc(t(lang, 'video.add.placeholder'));

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

  const navExtra = `<details class="add-channel">
<summary>${addChannelLabel}</summary>
<div class="add-channel-panel">
  <form id="add-channel-form" class="add-channel-form">
    <input name="url" type="url" required placeholder="${addChannelPlaceholder}">
    <input name="tags" placeholder="${addChannelTagsPlaceholder}">
    <button type="submit">${addChannelLabel}</button>
  </form>
  <div id="add-channel-msg" class="add-channel-msg"></div>
</div>
</details>
<details class="add-channel">
<summary>${addVideoLabel}</summary>
<div class="add-channel-panel">
  <form id="add-video-form" class="add-channel-form">
    <input name="url" type="url" required placeholder="${addVideoPlaceholder}">
    <button type="submit">${addVideoLabel}</button>
  </form>
  <div id="add-video-msg" class="add-channel-msg"></div>
</div>
</details>`;

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

  const body = `<div class="topbar">
  <button class="sidebar-toggle" id="sidebar-toggle">&#9776;</button>
  <span class="topbar-label">${esc(currentLabel)}</span>
</div>
${sidebar}
<div class="cards" id="cards"></div>
<button class="btn-more" id="btn-more">Load more</button>`;

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

  const body = `<div class="topbar">
  <button class="sidebar-toggle" id="sidebar-toggle">&#9776;</button>
  <span class="topbar-label">${channelName}</span>
</div>
${sidebar}
<div class="cards" id="cards"></div>
${loadMore}`;

  return page({
    title: opts.channelName,
    lang: opts.lang,
    head: headScripts,
    navExtra,
    body,
    scripts: ['/static/js/card.js', '/static/js/add-channel.js', '/static/js/sidebar.js'],
  });
}
