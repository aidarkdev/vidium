/**
 * render.ts — assembles full HTML pages with baked JSON for feed and channel views.
 */

import { page } from './page.ts';
import { esc } from './esc.ts';
import { t } from './lang.ts';
import type { JobAdminRow } from '../lib/queue.ts';
import type { DownloadedVideoRow, VideoRow, VideoStatusRow, VideoStatusSummary } from '../lib/video.ts';
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

export interface AdminPageOptions {
  lang: string;
  channels: ChannelRef[];
  jobs: JobAdminRow[];
  statusSummary: VideoStatusSummary[];
  problemRows: VideoStatusRow[];
  downloadedVideos: DownloadedVideoRow[];
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
  const controlsLabel = esc(t(lang, 'nav.controls'));
  const manageLabel = esc(t(lang, 'nav.manage'));
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
  const adminStringsJson = JSON.stringify({
    deleteFiles: t(lang, 'admin.action.delete_files'),
    deleteVideo: t(lang, 'admin.action.delete_video'),
    deleteJob: t(lang, 'admin.action.delete_job'),
    deleting: t(lang, 'admin.action.deleting'),
    confirmDeleteFiles: t(lang, 'admin.confirm.delete_files'),
    confirmDeleteVideo: t(lang, 'admin.confirm.delete_video'),
    confirmDeleteJob: t(lang, 'admin.confirm.delete_job'),
    error: t(lang, 'admin.error.action_failed'),
  });

  const navExtra = renderAddFormsView({
    controlsLabel,
    manageLabel,
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
    `<script>const ADMIN_STRINGS = ${adminStringsJson};</script>`,
  ].join('\n');

  return { navExtra, headScripts };
}

function renderAdminBody(opts: AdminPageOptions): string {
  const jobsHead = `
    <tr>
      <th>${esc(t(opts.lang, 'admin.col.id'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.type'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.status'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.attempts'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.youtube_id'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.error'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.created_at'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.actions'))}</th>
    </tr>`;
  const jobsRows = opts.jobs.length
    ? opts.jobs
        .map(
          (j) => `<tr>
      <td>${j.id}</td>
      <td>${esc(j.type)}</td>
      <td>${esc(j.status)}</td>
      <td>${j.attempts}</td>
      <td>${esc(j.youtubeId)}</td>
      <td>${esc(j.error)}</td>
      <td>${esc(j.createdAt)}</td>
      <td>
        <button class="btn admin-btn admin-btn-danger" data-action="admin-delete-job" data-job-id="${j.id}">
          ${esc(t(opts.lang, 'admin.action.delete_job'))}
        </button>
      </td>
    </tr>`,
        )
        .join('\n')
    : `<tr><td colspan="8">${esc(t(opts.lang, 'admin.empty'))}</td></tr>`;

  const statusesHead = `
    <tr>
      <th>${esc(t(opts.lang, 'admin.col.status'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.video'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.audio'))}</th>
    </tr>`;
  const statusesRows = opts.statusSummary
    .map(
      (r) => `<tr>
      <td>${esc(r.status)}</td>
      <td>${r.videoCount}</td>
      <td>${r.audioCount}</td>
    </tr>`,
    )
    .join('\n');

  const problemHead = `
    <tr>
      <th>${esc(t(opts.lang, 'admin.col.youtube_id'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.title'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.video'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.audio'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.ready_at'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.created_at'))}</th>
    </tr>`;
  const problemRows = opts.problemRows.length
    ? opts.problemRows
        .map(
          (r) => `<tr>
      <td>${esc(r.youtubeId)}</td>
      <td>${esc(r.title)}</td>
      <td>${esc(r.videoStatus)}</td>
      <td>${esc(r.audioStatus)}</td>
      <td>${esc(r.readyAt)}</td>
      <td>${esc(r.createdAt)}</td>
    </tr>`,
        )
        .join('\n')
    : `<tr><td colspan="6">${esc(t(opts.lang, 'admin.empty'))}</td></tr>`;

  const downloadedHead = `
    <tr>
      <th>${esc(t(opts.lang, 'admin.col.youtube_id'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.title'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.video'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.audio'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.ready_at'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.created_at'))}</th>
      <th>${esc(t(opts.lang, 'admin.col.actions'))}</th>
    </tr>`;
  const downloadedRows = opts.downloadedVideos.length
    ? opts.downloadedVideos
        .map(
          (r) => `<tr data-video-row="${esc(r.youtubeId)}">
      <td>${esc(r.youtubeId)}</td>
      <td>${esc(r.title)}</td>
      <td>${esc(r.videoStatus)}</td>
      <td>${esc(r.audioStatus)}</td>
      <td>${esc(r.readyAt)}</td>
      <td>${esc(r.createdAt)}</td>
      <td class="admin-actions-cell">
        <button class="btn admin-btn" data-action="admin-delete-files" data-youtube-id="${esc(r.youtubeId)}">
          ${esc(t(opts.lang, 'admin.action.delete_files'))}
        </button>
        <button class="btn admin-btn admin-btn-danger" data-action="admin-delete-video" data-youtube-id="${esc(r.youtubeId)}">
          ${esc(t(opts.lang, 'admin.action.delete_video'))}
        </button>
      </td>
    </tr>`,
        )
        .join('\n')
    : `<tr><td colspan="7">${esc(t(opts.lang, 'admin.empty'))}</td></tr>`;

  return `${renderTopbar(opts.lang, esc(t(opts.lang, 'admin.title')))}
  ${renderSidebar(opts.channels, opts.lang)}
  <section class="admin-section">
    <h2>${esc(t(opts.lang, 'admin.jobs'))}</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>${jobsHead}</thead>
        <tbody>${jobsRows}</tbody>
      </table>
    </div>
  </section>
  <section class="admin-section">
    <h2>${esc(t(opts.lang, 'admin.statuses'))}</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>${statusesHead}</thead>
        <tbody>${statusesRows}</tbody>
      </table>
    </div>
  </section>
  <section class="admin-section">
    <h2>${esc(t(opts.lang, 'admin.problem_rows'))}</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>${problemHead}</thead>
        <tbody>${problemRows}</tbody>
      </table>
    </div>
  </section>
  <section class="admin-section">
    <h2>${esc(t(opts.lang, 'admin.downloaded'))}</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>${downloadedHead}</thead>
        <tbody>${downloadedRows}</tbody>
      </table>
    </div>
  </section>`;
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
  const currentLabel =
    systemLabels[opts.activeTag] ?? opts.tagLabels[opts.activeTag] ?? opts.activeTag;
  const sidebar = renderSidebar(opts.channels, opts.lang, undefined, opts.activeTag);

  const body = renderFeedBodyView(renderTopbar(opts.lang, esc(currentLabel)), sidebar);

  return page({
    title: 'vidium',
    lang: opts.lang,
    head: headScripts,
    navExtra,
    body,
    scripts: [
      '/static/js/card.view.js',
      '/static/js/card.js',
      '/static/js/add-channel.js',
      '/static/js/nav-dropdown.js',
      '/static/js/sidebar.js',
    ],
  });
}

export function renderChannelPage(opts: ChannelPageOptions): string {
  const channelName = esc(opts.channelName);
  const loadMore = opts.hasMore
    ? `<button class="btn-more" id="btn-more" data-channel="${opts.channelId}" style="display:none">Load more</button>`
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
    scripts: [
      '/static/js/card.view.js',
      '/static/js/card.js',
      '/static/js/add-channel.js',
      '/static/js/nav-dropdown.js',
      '/static/js/sidebar.js',
    ],
  });
}

export function renderAdminPage(opts: AdminPageOptions): string {
  const { navExtra, headScripts: addHeadScripts } = renderAddForms(opts.lang);
  const body = renderAdminBody(opts);

  return page({
    title: t(opts.lang, 'admin.title'),
    lang: opts.lang,
    head: addHeadScripts,
    navExtra,
    body,
    scripts: [
      '/static/js/add-channel.js',
      '/static/js/admin.js',
      '/static/js/nav-dropdown.js',
      '/static/js/sidebar.js',
    ],
  });
}
