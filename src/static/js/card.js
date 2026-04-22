/**
 * card.js — renders video cards from baked CARDS array.
 * No framework, no build step, no API calls for pagination.
 *
 * Globals injected by server:
 *   const UI_LANG = 'en';
 *   const CARDS = [...];
 *   const SINCE = 1234567890000;
 */

const PAGE_SIZE = 21;
let rendered = 0;

// ── i18n ──────────────────────────────────────────────────────────────────────

// UI_STRINGS is baked by the server from lang.ts for the current user language.
const lang = UI_STRINGS;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ── Card rendering ────────────────────────────────────────────────────────────

function resolveChannelName(name) {
  return name;
}

function actionButton(id, type, status) {
  if (status === 'ready') {
    const href = type === 'video' ? `/v/${id}` : `/a/${id}`;
    const label = type === 'video' ? lang.watch : lang.listen;
    return `<a class="btn btn-${type}" href="${href}">${label}</a>`;
  }
  if (status === 'queued' || status === 'downloading') {
    const label = status === 'queued' ? lang.queued : lang.downloading;
    return `<span class="btn btn-${type} btn-pending" data-id="${id}" data-type="${type}">${label}</span>`;
  }
  const label = type === 'video' ? lang.downloadVideo : lang.downloadAudio;
  return `<button class="btn btn-${type}" data-action="download" data-id="${esc(id)}" data-type="${type}">${label}</button>`;
}

function renderCard(card) {
  return `<article class="card" data-id="${esc(card.youtubeId)}">
  <img class="card-thumb" src="/t/${esc(card.youtubeId)}" alt="${esc(card.title)}" loading="lazy">
  <div class="card-body">
    <h2 class="card-title">
      ${card.channelName ? `<div class="card-channel">${esc(resolveChannelName(card.channelName))}</div>` : ''}<div class="card-title-text">${esc(card.title)}</div>
    </h2>
    <div class="card-meta">
      <span class="card-date">${esc(formatDate(card.date))}</span>
      ${card.duration ? `<span class="card-duration">${formatDuration(card.duration)}</span>` : ''}
    </div>
    <div class="card-actions">
      ${actionButton(card.youtubeId, 'video', card.videoStatus)}
      ${actionButton(card.youtubeId, 'audio', card.audioStatus)}
    </div>
  </div>
</article>`;
}

// ── Pagination ────────────────────────────────────────────────────────────────

const container = document.getElementById('cards');
const btnMore = document.getElementById('btn-more');

function renderNext() {
  const batch = CARDS.slice(rendered, rendered + PAGE_SIZE);
  container.insertAdjacentHTML('beforeend', batch.map(renderCard).join(''));
  rendered += batch.length;
  if (rendered >= CARDS.length && btnMore) btnMore.style.display = 'none';
}

renderNext();

if (btnMore) {
  btnMore.textContent = lang.loadMore;
  btnMore.addEventListener('click', renderNext);
}

// ── Download ──────────────────────────────────────────────────────────────────

container.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="download"]');
  if (!btn) return;

  const id = btn.dataset.id;
  const type = btn.dataset.type;

  btn.disabled = true;
  btn.textContent = lang.queued;
  btn.removeAttribute('data-action');
  btn.classList.add('btn-pending');

  await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtubeId: id, type }),
  });

  startPolling(id);
});

// ── Status polling ────────────────────────────────────────────────────────────

const polling = new Set();

function startPolling(id) {
  polling.add(id);
  if (polling.size === 1) poll();
}

async function poll() {
  if (!polling.size) return;

  const ids = [...polling].join(',');
  const res = await fetch(`/api/status?ids=${ids}`);
  const data = await res.json();

  for (const [youtubeId, status] of Object.entries(data)) {
    updateCard(youtubeId, status.video, status.audio);
    if (
      status.video !== 'queued' &&
      status.video !== 'downloading' &&
      status.audio !== 'queued' &&
      status.audio !== 'downloading'
    ) {
      polling.delete(youtubeId);
    }
  }

  if (polling.size) setTimeout(poll, 5000);
}

function updateCard(id, videoStatus, audioStatus) {
  const card = container.querySelector(`[data-id="${id}"]`);
  if (!card) return;
  const actions = card.querySelector('.card-actions');
  if (!actions) return;
  actions.innerHTML =
    actionButton(id, 'video', videoStatus) + actionButton(id, 'audio', audioStatus);
}

// ── New videos since page load ────────────────────────────────────────────────

async function checkSince() {
  const res = await fetch(`/api/since?t=${SINCE}`);
  const items = await res.json();
  if (!items.length) return;
  SINCE = Date.now();
  CARDS.unshift(...items);
  container.insertAdjacentHTML('afterbegin', items.map(renderCard).join(''));
}

setInterval(() => {
  checkSince().catch(() => {});
}, 60_000);
