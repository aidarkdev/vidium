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

function actionButton(id, type, status, strings) {
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
  return `<div class="card-channel">${htmlEscape(card.channelName)}</div>`;
}

function durationHtml(card) {
  if (!card.duration) return '';
  return `<span class="card-duration">${formatDuration(card.duration)}</span>`;
}

export function cardHtml(card, strings) {
  return `<article class="card" data-id="${htmlEscape(card.youtubeId)}">
    <img
      class="card-thumb"
      src="/t/${htmlEscape(card.youtubeId)}"
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
        ${actionButton(card.youtubeId, 'video', card.videoStatus, strings)}
        ${actionButton(card.youtubeId, 'audio', card.audioStatus, strings)}
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

function sidebarItem(ch, activeChannelId, labels, movingId, savingId) {
  const disabled = movingId === ch.id || savingId === ch.id;

  return `<div class="sidebar-channel-row" data-channel-id="${ch.id}">
    <a
      class="sidebar-channel-link${ch.id === activeChannelId ? ' active' : ''}"
      href="/channel/${ch.id}"
    >${htmlEscape(ch.displayName || ch.name)}</a>
    ${sidebarEditForm(ch, labels, disabled)}
  </div>`;
}

function systemLink(href, active, label) {
  return `<a href="${href}"${active ? ' class="active"' : ''}>${htmlEscape(label)}</a>`;
}

export function sidebarHtml(state) {
  const manual = state.channels.find((ch) => ch.id === 1);
  const regular = state.channels.filter((ch) => ch.id !== 1);
  const manualLabel = manual?.displayName || manual?.name || 'manual';

  return `<div
    class="sidebar-panel${state.sidebarOpen ? ' open' : ''}${state.editMode ? ' edit-mode' : ''}"
    data-ref="sidebar"
  >
    <div class="sidebar-system">
      ${systemLink('/feed', state.activeTag === 'all', state.labels.all)}
      ${systemLink('/feed/ready', state.activeTag === 'ready', state.labels.ready)}
      ${systemLink('/feed/manual', state.activeTag === 'manual', manualLabel)}
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-channels" data-ref="sidebarChannels">
      ${regular.map((ch) => sidebarItem(ch, state.activeChannelId, state.labels, state.movingChannelId, state.savingChannelNameId)).join('')}
    </div>
  </div>`;
}

export function cardsHtml(state) {
  return state.cards
    .slice(0, state.visibleCount)
    .map((card) => cardHtml(card, state.strings))
    .join('');
}

function moreDisplay(state) {
  return state.visibleCount < state.cards.length ? 'block' : 'none';
}

export default function template(state) {
  return `<section class="feed-part">
    <div class="topbar">
      <button class="sidebar-toggle" data-action="toggle-sidebar">&#9776;</button>
      <span class="topbar-label" data-ref="title">${htmlEscape(state.title)}</span>
    </div>
    ${sidebarHtml(state)}
    <div class="cards" data-ref="cards">${cardsHtml(state)}</div>
    <button
      class="btn-more"
      data-ref="more"
      data-action="more"
      style="display:${moreDisplay(state)}"
    >${htmlEscape(state.strings.loadMore)}</button>
  </section>`;
}
