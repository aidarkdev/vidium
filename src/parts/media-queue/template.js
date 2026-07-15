import { escape as htmlEscape } from '../../engine/core.js';

const knownStatuses = new Set(['none', 'queued', 'downloading', 'ready', 'expired']);

function queueIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 6h14M5 12h14M5 18h9"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
    <path
      d="m17 16 2 2 3-4"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`;
}

function closeIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="m6 6 12 12M18 6 6 18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>`;
}

function removeIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`;
}

function statusLabel(state, status) {
  return state.statusLabels[status] || status;
}

function itemHtml(item, state) {
  const href =
    item.type === 'video'
      ? `/v/${encodeURIComponent(item.uid)}`
      : `/a/${encodeURIComponent(item.uid)}`;
  const typeLabel = item.type === 'video' ? state.labels.video : state.labels.audio;
  const statusClass = knownStatuses.has(item.status) ? item.status : 'unknown';

  return `<li class="media-queue-row" data-uid="${htmlEscape(item.uid)}" data-type="${item.type}">
    <a class="media-queue-link" href="${href}">
      <span class="media-queue-item-title">${htmlEscape(item.title)}</span>
      <span class="media-queue-item-type">${htmlEscape(typeLabel)}</span>
    </a>
    <span class="media-queue-status media-queue-status-${statusClass}">
      ${htmlEscape(statusLabel(state, item.status))}
    </span>
    <button
      class="media-queue-remove"
      type="button"
      data-action="remove"
      data-uid="${htmlEscape(item.uid)}"
      data-type="${item.type}"
      aria-label="${htmlEscape(state.labels.remove)}"
      title="${htmlEscape(state.labels.remove)}"
    >${removeIcon()}</button>
  </li>`;
}

export function itemsHtml(state) {
  if (state.storageError) {
    return `<p class="media-queue-message media-queue-error">
      ${htmlEscape(state.labels.storageError)}
    </p>`;
  }
  if (!state.items.length) {
    return `<p class="media-queue-message">${htmlEscape(state.labels.empty)}</p>`;
  }
  return `<ul class="media-queue-list">
    ${state.items.map((item) => itemHtml(item, state)).join('')}
  </ul>`;
}

export default function template(state, part) {
  const dialogId = `${part.id}-dialog`;
  const titleId = `${part.id}-title`;

  return `<div class="media-queue">
    <button
      class="media-queue-open"
      type="button"
      data-action="open"
      aria-haspopup="dialog"
      aria-controls="${htmlEscape(dialogId)}"
      aria-label="${htmlEscape(state.labels.open)}"
      title="${htmlEscape(state.labels.open)}"
    >${queueIcon()}</button>
    <dialog
      class="media-queue-dialog"
      id="${htmlEscape(dialogId)}"
      data-ref="dialog"
      aria-labelledby="${htmlEscape(titleId)}"
    >
      <div class="media-queue-panel">
        <header class="media-queue-header">
          <h2 id="${htmlEscape(titleId)}">${htmlEscape(state.labels.title)}</h2>
          <button
            class="media-queue-close"
            type="button"
            data-action="close"
            aria-label="${htmlEscape(state.labels.close)}"
            title="${htmlEscape(state.labels.close)}"
          >${closeIcon()}</button>
        </header>
        <div class="media-queue-items" data-ref="items">${itemsHtml(state)}</div>
      </div>
    </dialog>
  </div>`;
}
