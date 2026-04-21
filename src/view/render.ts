/**
 * render.ts — assembles full HTML pages with baked JSON for feed and channel views.
 */

import { page } from './page.ts';
import { esc } from './esc.ts';
import { t } from './lang.ts';
import type { VideoRow } from '../lib/video.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardData = VideoRow;

export interface FeedPageOptions {
  lang: string;
  cards: CardData[];
  tags: string[];
  tagLabels: Record<string, string>;
  activeTag: string;
  since: number; // unix ms timestamp of page render
}

export interface ChannelPageOptions {
  lang: string;
  channelId: number;
  channelName: string;
  cards: CardData[];
  hasMore: boolean;
  since: number;
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
  return `<script>
const UI_LANG = ${JSON.stringify(lang)};
const UI_STRINGS = ${JSON.stringify(strings)};
const CARDS = ${JSON.stringify(cards)};
const SINCE = ${since};
</script>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function renderFeedPage(opts: FeedPageOptions): string {
  const SYSTEM_TAGS = new Set(['ready', 'all', 'manual']);
  const tagLinks = opts.tags
    .map((tag) => {
      const active = tag === opts.activeTag ? ' class="active"' : '';
      const href = tag === 'all' ? '/feed' : `/feed/${esc(tag)}`;
      const defaultLabel = SYSTEM_TAGS.has(tag) ? t(opts.lang, `tag.${tag}`) : tag;
      const label = esc(opts.tagLabels[tag] ?? defaultLabel);
      return `<a href="${href}"${active} data-tag="${esc(tag)}">${label}</a>`;
    })
    .join('\n');

  const addForm = `<details class="add-channel">
<summary>${t(opts.lang, 'channel.add')}</summary>
<div class="add-channel-panel">
  <form id="add-channel-form" class="add-channel-form">
    <input name="url" type="url" required placeholder="${esc(t(opts.lang, 'channel.add.placeholder'))}">
    <input name="tags" placeholder="${esc(t(opts.lang, 'channel.add.tags_placeholder'))}">
    <button type="submit">${t(opts.lang, 'channel.add')}</button>
  </form>
  <div id="add-channel-msg" class="add-channel-msg"></div>
</div>
</details>`;

  const addVideoForm = `<details class="add-channel">
<summary>${t(opts.lang, 'video.add')}</summary>
<div class="add-channel-panel">
  <form id="add-video-form" class="add-channel-form">
    <input name="url" type="url" required placeholder="${esc(t(opts.lang, 'video.add.placeholder'))}">
    <button type="submit">${t(opts.lang, 'video.add')}</button>
  </form>
  <div id="add-video-msg" class="add-channel-msg"></div>
</div>
</details>`;

  const addStrings = {
    added: t(opts.lang, 'channel.added'),
    exists: t(opts.lang, 'channel.exists'),
    error: t(opts.lang, 'channel.error'),
  };

  const addVideoStrings = {
    added: t(opts.lang, 'video.added'),
    exists: t(opts.lang, 'video.exists'),
    error: t(opts.lang, 'video.error'),
  };

  const body = `<div class="feed-tags" id="feed-tags">
  <div class="tags-list"><button class="tags-toggle" id="tags-toggle">&#10095;</button>${tagLinks}</div>
</div>
<div class="cards" id="cards"></div>
<button class="btn-more" id="btn-more">Load more</button>`;

  return page({
    title: 'vidium',
    lang: opts.lang,
    head:
      bakedScript(opts.cards, opts.lang, opts.since) +
      `\n<script>const ADD_STRINGS = ${JSON.stringify(addStrings)};</script>` +
      `\n<script>const ADD_VIDEO_STRINGS = ${JSON.stringify(addVideoStrings)};</script>` +
      `\n<script>const TAG_LABELS = ${JSON.stringify(opts.tagLabels)};</script>`,
    navExtra:
      addForm +
      addVideoForm +
      `<label class="nav-edit-tags"><input type="checkbox" id="edit-tags-toggle"> ${t(opts.lang, 'nav.edit_tags')}</label>`,
    body,
    scripts: ['/static/js/card.js', '/static/js/add-channel.js', '/static/js/tag-labels.js'],
  });
}

export function renderChannelPage(opts: ChannelPageOptions): string {
  const loadMore = opts.hasMore
    ? `<button class="btn-more" id="btn-more" data-channel="${opts.channelId}">Load more</button>`
    : '';

  const body = `<h1 class="channel-title">${esc(opts.channelName)}</h1>
<div class="cards" id="cards"></div>
${loadMore}`;

  return page({
    title: opts.channelName,
    lang: opts.lang,
    head: bakedScript(opts.cards, opts.lang, opts.since),
    body,
    scripts: ['/static/js/card.js'],
  });
}
