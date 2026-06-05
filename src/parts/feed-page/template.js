import { escape as htmlEscape } from '../../engine/core.js';

const pendingStatuses = new Set(['queued', 'downloading']);

function formatDate(iso) {
  if (!iso || iso.length < 10) return htmlEscape(iso);
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

function formatDuration(seconds) {
  const n = Number(seconds || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function actionButton(id, type, status, strings, options = {}) {
  if (status === 'ready') {
    const href = type === 'video' ? `/v/${htmlEscape(id)}` : `/a/${htmlEscape(id)}`;
    const label = type === 'video' ? strings.watch : strings.listen;
    return `<a class="btn btn-${type}" href="${href}">${htmlEscape(label)}</a>`;
  }

  if (pendingStatuses.has(status)) {
    const label = status === 'queued' ? strings.queued : strings.downloading;
    return `<span
      class="btn btn-${type} btn-pending"
      data-id="${htmlEscape(id)}"
      data-type="${type}"
    >${htmlEscape(label)}</span>`;
  }

  if (options.allowDownload === false) return '';

  const label = type === 'video' ? strings.downloadVideo : strings.downloadAudio;
  return `<button
    class="btn btn-${type}"
    data-action="download"
    data-id="${htmlEscape(id)}"
    data-type="${type}"
  >${htmlEscape(label)}</button>`;
}

function channelHtml(card) {
  if (!card.channelName) return '';
  if (!card.channelId) return `<div class="card-channel">${htmlEscape(card.channelName)}</div>`;

  return `<a class="card-channel" href="/channel/${htmlEscape(String(card.channelId))}">${htmlEscape(card.channelName)}</a>`;
}

function durationHtml(card) {
  if (!card.duration) return '';
  return `<span class="card-duration">${formatDuration(card.duration)}</span>`;
}

export function cardHtml(card, strings, options = {}) {
  return `<article class="card" data-id="${htmlEscape(card.uid)}">
    <img
      class="card-thumb"
      src="/t/${htmlEscape(card.uid)}"
      alt="${htmlEscape(card.title)}"
      loading="lazy"
    >
    <div class="card-body">
      <h2 class="card-title">
        ${channelHtml(card)}
        <div class="card-title-text">${htmlEscape(card.title)}</div>
      </h2>
      <div class="card-meta">
        <span class="card-date">${formatDate(card.date)}</span>
        ${durationHtml(card)}
      </div>
      <div class="card-actions">
        ${actionButton(card.uid, 'video', card.videoStatus, strings, options)}
        ${actionButton(card.uid, 'audio', card.audioStatus, strings, options)}
      </div>
    </div>
  </article>`;
}

function orderButton(ch, direction, label, disabled) {
  return `<button
    class="sidebar-order-btn"
    type="button"
    data-action="move-channel"
    data-direction="${direction}"
    data-channel-id="${ch.id}"
    aria-label="${htmlEscape(label)}"
    title="${htmlEscape(label)}"
    ${disabled ? 'disabled' : ''}
  >${direction === 'up' ? '&#8593;' : '&#8595;'}</button>`;
}

function sidebarEditForm(ch, labels, disabled) {
  return `<form class="sidebar-channel-edit" data-action="save-channel-name">
    <input
      class="sidebar-channel-name-input"
      name="displayName"
      value="${htmlEscape(ch.displayName || ch.name)}"
      autocomplete="off"
      ${disabled ? 'disabled' : ''}
    >
    <button
      class="sidebar-save-btn"
      type="submit"
      data-channel-id="${ch.id}"
      aria-label="${htmlEscape(labels.save)}"
      title="${htmlEscape(labels.save)}"
      ${disabled ? 'disabled' : ''}
    >✓</button>
    ${orderButton(ch, 'up', labels.moveUp, disabled)}
    ${orderButton(ch, 'down', labels.moveDown, disabled)}
  </form>`;
}

function tagOrderButton(item, direction, label, disabled) {
  return `<button
    class="sidebar-order-btn"
    type="button"
    data-action="move-tag"
    data-direction="${direction}"
    data-tag="${htmlEscape(item.tag)}"
    aria-label="${htmlEscape(label)}"
    title="${htmlEscape(label)}"
    ${disabled ? 'disabled' : ''}
  >${direction === 'up' ? '&#8593;' : '&#8595;'}</button>`;
}

function sidebarTagEdit(item, labels, disabled) {
  return `<div class="sidebar-tag-edit">
    <span class="sidebar-tag-label">${htmlEscape(item.label || item.tag)}</span>
    ${tagOrderButton(item, 'up', labels.moveUp, disabled)}
    ${tagOrderButton(item, 'down', labels.moveDown, disabled)}
    <button
      class="sidebar-delete-btn"
      type="button"
      data-action="delete-tag"
      data-tag="${htmlEscape(item.tag)}"
      aria-label="${htmlEscape(labels.deleteTag)}"
      title="${htmlEscape(labels.deleteTag)}"
      ${disabled ? 'disabled' : ''}
    >×</button>
  </div>`;
}

export function sidebarItem(ch, activeChannelId, labels, movingId, savingId) {
  const disabled = movingId === ch.id || savingId === ch.id;

  return `<div class="sidebar-channel-row" data-channel-id="${ch.id}">
    <a
      class="sidebar-channel-link${ch.id === activeChannelId ? ' active' : ''}"
      href="/channel/${ch.id}"
    >${htmlEscape(ch.displayName || ch.name)}</a>
    ${sidebarEditForm(ch, labels, disabled)}
  </div>`;
}

function sidebarTagItem(item, state) {
  const disabled = state.movingTag === item.tag;

  return `<div class="sidebar-tag-row" data-tag="${htmlEscape(item.tag)}">
    <a
      class="sidebar-tag-link${item.tag === state.activeTag ? ' active' : ''}"
      href="/feed/${encodeURIComponent(item.tag)}"
    >${htmlEscape(item.label || item.tag)}</a>
    ${sidebarTagEdit(item, state.labels, disabled)}
  </div>`;
}

function sidebarModeTabs(state) {
  return `<div class="sidebar-mode-tabs">
    <button
      type="button"
      data-action="sidebar-mode"
      data-mode="channels"
      class="${state.sidebarMode === 'channels' ? 'active' : ''}"
    >${htmlEscape(state.labels.channels)}</button>
    <button
      type="button"
      data-action="sidebar-mode"
      data-mode="tags"
      class="${state.sidebarMode === 'tags' ? 'active' : ''}"
    >${htmlEscape(state.labels.tags)}</button>
  </div>`;
}

function systemLink(href, active, label) {
  return `<a class="sidebar-system-link${active ? ' active' : ''}" href="${href}">${htmlEscape(label)}</a>`;
}

export function sidebarHtml(state) {
  const manual = state.channels.find((ch) => ch.id === 1);
  const regular = state.channels.filter((ch) => ch.id !== 1);
  const manualLabel = manual?.displayName || manual?.name || 'manual';
  const systemLinks =
    state.showSystemLinks === false
      ? ''
      : `<div class="sidebar-system">
        ${systemLink('/feed', state.activeTag === 'all', state.labels.all)}
        ${systemLink('/feed/ready', state.activeTag === 'ready', state.labels.ready)}
        ${systemLink('/feed/manual', state.activeTag === 'manual', manualLabel)}
      </div>
      <div class="sidebar-divider"></div>`;
  const modeTabs = state.showSidebarModeTabs === false ? '' : sidebarModeTabs(state);

  return `<div
    class="sidebar-panel${state.sidebarOpen ? ' open' : ''}${state.editMode ? ' edit-mode' : ''}"
    data-ref="sidebar"
  >
    ${systemLinks}
    ${modeTabs}
    <div class="sidebar-channels" data-ref="sidebarChannels">
      ${
        state.sidebarMode === 'tags'
          ? state.tags.map((tag) => sidebarTagItem(tag, state)).join('')
          : regular.map((ch) => sidebarItem(ch, state.activeChannelId, state.labels, state.movingChannelId, state.savingChannelNameId)).join('')
      }
    </div>
  </div>`;
}

export default function template(state) {
  return `<section class="feed-part">
    <div class="topbar">
      <button class="sidebar-toggle" data-action="toggle-sidebar">&#9776;</button>
      <span class="topbar-label" data-ref="title">${htmlEscape(state.title)}</span>
    </div>
    ${sidebarHtml(state)}
  </section>`;
}
