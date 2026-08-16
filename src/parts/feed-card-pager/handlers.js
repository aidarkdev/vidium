import { cardHtml } from '../feed-page/template.js';
import { cardsHtml, pagerHtml } from './template.js';

const pendingStatuses = new Set(['queued', 'downloading']);
const QUEUE_STORAGE_KEY = 'vidium:media-queue:v1';
const QUEUE_ITEM_ADDED_EVENT = 'vidium:media-queue-item-added';
const UID_RE = /^[A-Za-z0-9_-]{16,22}$/;

function normalizeQueueItem(value) {
  if (!value || typeof value !== 'object') return null;
  if (!UID_RE.test(value.uid) || !['video', 'audio'].includes(value.type)) return null;
  return {
    uid: value.uid,
    type: value.type,
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : value.uid,
    status: typeof value.status === 'string' && value.status ? value.status : 'none',
    addedAt: Number.isFinite(value.addedAt) ? value.addedAt : 0,
  };
}

function readLocalQueueItems() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.map(normalizeQueueItem).filter(Boolean);
  } catch {
    return [];
  }
}

function upsertLocalQueueItem(items, nextItem) {
  return [
    nextItem,
    ...items.filter((item) => item.uid !== nextItem.uid || item.type !== nextItem.type),
  ].sort((a, b) => b.addedAt - a.addedAt);
}

function normalizePage(value, fallback) {
  const page = Number.parseInt(String(value), 10);
  return Number.isInteger(page) && page > 0 ? page : fallback;
}

function pageFromUrl() {
  return normalizePage(new URL(window.location.href).searchParams.get('page'), 1);
}

function pageUrl(page) {
  const url = new URL(window.location.href);
  if (page > 1) url.searchParams.set('page', String(page));
  else url.searchParams.delete('page');
  return url;
}

function writePageToUrl(part, page) {
  const mode = part.private.urlWriteMode || 'push';
  part.private.urlWriteMode = '';
  if (mode === 'skip') return;
  history[mode === 'replace' ? 'replaceState' : 'pushState'](
    { [part.id]: { page } },
    '',
    pageUrl(page),
  );
}

function queryForPage(part, page) {
  const params = new URLSearchParams({ page: String(page) });
  if (part.state.activeChannelId) params.set('channelId', String(part.state.activeChannelId));
  else params.set('tag', part.state.activeTag || 'all');
  return params;
}

function pollingIdsForCards(cards) {
  return cards
    .filter(
      (card) => pendingStatuses.has(card.videoStatus) || pendingStatuses.has(card.audioStatus),
    )
    .map((card) => card.uid);
}

function rerenderCards(part) {
  part.refs.cards.innerHTML = cardsHtml(part.state);
}

function rerenderPager(part) {
  const fresh = document.createElement('template');
  fresh.innerHTML = pagerHtml(part.state);
  const next = fresh.content.firstElementChild;
  part.refs.pager.replaceWith(next);
  part.refs.pager = next;
  part.refs.status = next.querySelector('[data-ref="status"]');
  part.refs.message = next.querySelector('[data-ref="message"]');
}

function rerenderUpdatedCards(part, updates) {
  for (const { id } of updates) {
    const card = part.state.cards.find((item) => item.uid === id);
    const node = part.refs.cards.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!card || !node) continue;

    const fresh = document.createElement('template');
    fresh.innerHTML = cardHtml(card, part.state.strings);
    node.replaceWith(fresh.content.firstElementChild);
  }
}

function applyCardStatusUpdates(part, updates) {
  part.state.cards = part.state.cards.map((card) => {
    const update = updates.find((item) => item.id === card.uid);
    if (!update) return card;

    return {
      ...card,
      videoStatus: update.videoStatus ?? card.videoStatus,
      audioStatus: update.audioStatus ?? card.audioStatus,
    };
  });
  rerenderUpdatedCards(part, updates);
}

function stopPolling(part) {
  clearTimeout(part.private.pollTimer);
  part.private.pollTimer = null;
  part.private.pollAbort?.abort();
  part.private.pollAbort = null;
}

function schedulePoll(part, delay) {
  if (part.private.destroyed || !part.state.pollingIds.length) return;
  clearTimeout(part.private.pollTimer);
  part.private.pollTimer = setTimeout(() => {
    part.private.pollTimer = null;
    poll(part);
  }, delay);
}

async function poll(part) {
  if (part.private.destroyed || !part.state.pollingIds.length) return;

  part.private.pollAbort?.abort();
  const controller = new AbortController();
  part.private.pollAbort = controller;

  try {
    const res = await fetch(`/api/status?ids=${part.state.pollingIds.join(',')}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`status request failed: ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('status response is invalid');
    }

    let pollingIds = part.state.pollingIds;
    const patchCardStatusUpdates = [];

    for (const [id, status] of Object.entries(data)) {
      const current = part.state.cards.find((card) => card.uid === id);
      if (
        current &&
        (current.videoStatus !== status.video || current.audioStatus !== status.audio)
      ) {
        patchCardStatusUpdates.push({
          id,
          videoStatus: status.video,
          audioStatus: status.audio,
        });
      }
      if (!pendingStatuses.has(status.video) && !pendingStatuses.has(status.audio)) {
        pollingIds = pollingIds.filter((item) => item !== id);
      }
    }

    part.private.pollErrorReported = false;
    part.set({ pollingIds, patchCardStatusUpdates });
  } catch (error) {
    if (error?.name === 'AbortError') return;
    if (!part.private.pollErrorReported) {
      console.warn('Feed status polling failed; retrying', error);
      part.private.pollErrorReported = true;
    }
  } finally {
    if (part.private.pollAbort === controller) {
      part.private.pollAbort = null;
      if (!part.private.destroyed && part.state.pollingIds.length) schedulePoll(part, 5000);
    }
  }
}

function restartPolling(part, cards) {
  stopPolling(part);
  part.private.pollErrorReported = false;
  const pollingIds = [...new Set(pollingIdsForCards(cards))];
  part.set('pollingIds', pollingIds);
  if (pollingIds.length) schedulePoll(part, 0);
}

async function loadPage(part, page, options = {}) {
  const targetPage = normalizePage(page, part.state.page);
  part.private.pageAbort?.abort();
  part.private.pageAbort = new AbortController();
  part.set({ loading: true, error: '' });

  try {
    const res = await fetch(`/api/feed/cards?${queryForPage(part, targetPage).toString()}`, {
      signal: part.private.pageAbort.signal,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'request failed');

    part.private.urlWriteMode = options.updateUrl === false ? 'skip' : 'push';
    part.set({
      cards: data.cards,
      page: data.page,
      pageSize: data.pageSize,
      pageCount: data.pageCount,
      total: data.total,
      loading: false,
      error: '',
    });
    restartPolling(part, data.cards);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    part.set({ loading: false, error: part.state.strings.error });
  }
}

export default {
  events: {
    'click [data-action="page"]': (part, event) => {
      const btn = event.target.closest('[data-action="page"]');
      const page = normalizePage(btn.dataset.page, part.state.page);
      if (page === part.state.page || part.state.loading) return;
      loadPage(part, page).catch(() => {});
    },
    'click [data-action="download"]': async (part, event) => {
      const btn = event.target.closest('[data-action="download"]');
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      if (!['video', 'audio'].includes(type)) return;

      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: id, type }),
        });
        if (!res.ok) throw new Error('request failed');

        const data = await res.json();
        if (!data.ok || typeof data.status !== 'string') throw new Error('request failed');

        const current = part.state.cards.find((card) => card.uid === id);
        if (!current) return;
        const statusField = type === 'video' ? 'videoStatus' : 'audioStatus';
        const next = { ...current, [statusField]: data.status };
        const shouldPoll =
          pendingStatuses.has(next.videoStatus) || pendingStatuses.has(next.audioStatus);
        let pollingIds = part.state.pollingIds.filter((item) => item !== id);
        if (shouldPoll) pollingIds = [...pollingIds, id];
        const statusUpdate = { id, [statusField]: data.status };
        const localQueueItems = upsertLocalQueueItem(readLocalQueueItems(), {
          uid: id,
          type,
          title: current.title,
          status: data.status,
          addedAt: Date.now(),
        });

        part.set({
          error: '',
          pollingIds,
          patchCardStatusUpdates: [statusUpdate],
          localQueueItems,
        });
        if (shouldPoll && !part.private.pollTimer && !part.private.pollAbort) {
          schedulePoll(part, 0);
        }
      } catch {
        part.set('error', part.state.strings.error);
      }
    },
  },
  state: {
    cards: rerenderCards,
    page: (part, value) => {
      writePageToUrl(part, value);
      rerenderPager(part);
    },
    pageSize: rerenderPager,
    pageCount: rerenderPager,
    total: rerenderPager,
    loading: rerenderPager,
    error: rerenderPager,
    patchCardStatusUpdates: applyCardStatusUpdates,
    pollingIds: () => {},
    localQueueItems: (part, items) => {
      try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
        window.dispatchEvent(new CustomEvent(QUEUE_ITEM_ADDED_EVENT));
      } catch {
        part.set('error', part.state.strings.queueStorageError);
      }
    },
  },
  onMount: (part) => {
    part.private.onPopState = () => {
      loadPage(part, pageFromUrl(), { updateUrl: false }).catch(() => {});
    };
    window.addEventListener('popstate', part.private.onPopState);
    const initialUrlPage = pageFromUrl();
    if (initialUrlPage !== part.state.page) {
      loadPage(part, initialUrlPage, { updateUrl: false }).catch(() => {});
    } else {
      restartPolling(part, part.state.cards);
    }
  },
  onDestroy: (part) => {
    part.private.destroyed = true;
    window.removeEventListener('popstate', part.private.onPopState);
    part.private.pageAbort?.abort();
    stopPolling(part);
  },
};
