import { cardHtml } from '../feed-page/template.js';
import { cardsHtml, pagerHtml } from './template.js';

const pendingStatuses = new Set(['queued', 'downloading']);

function normalizePage(value, fallback) {
  const page = Number.parseInt(String(value), 10);
  return Number.isInteger(page) && page > 0 ? page : fallback;
}

function pageFromUrl(part) {
  return normalizePage(
    new URL(window.location.href).searchParams.get(part.state.pageParam),
    1,
  );
}

function pageUrl(part, page) {
  const url = new URL(window.location.href);
  if (page > 1) url.searchParams.set(part.state.pageParam, String(page));
  else url.searchParams.delete(part.state.pageParam);
  return url;
}

function writePageToUrl(part, page) {
  if (!part.state.syncUrl) return;
  const mode = part.private.urlWriteMode || 'push';
  part.private.urlWriteMode = '';
  if (mode === 'skip') return;
  history[mode === 'replace' ? 'replaceState' : 'pushState']({ [part.id]: { page } }, '', pageUrl(part, page));
}

function queryForPage(part, page) {
  const params = new URLSearchParams({ page: String(page) });
  if (part.state.activeChannelId) params.set('channelId', String(part.state.activeChannelId));
  else params.set('tag', part.state.activeTag || 'all');
  return params;
}

function pollingIdsForCards(cards) {
  return cards
    .filter((card) => pendingStatuses.has(card.videoStatus) || pendingStatuses.has(card.audioStatus))
    .map((card) => card.youtubeId);
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
    const card = part.state.cards.find((item) => item.youtubeId === id);
    const node = part.refs.cards.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!card || !node) continue;

    const fresh = document.createElement('template');
    fresh.innerHTML = cardHtml(card, part.state.strings, {
      allowDownload: part.state.allowDownload !== false,
    });
    node.replaceWith(fresh.content.firstElementChild);
  }
}

function applyCardStatusUpdates(part, updates) {
  part.state.cards = part.state.cards.map((card) => {
    const update = updates.find((item) => item.id === card.youtubeId);
    if (!update) return card;

    return {
      ...card,
      videoStatus: update.videoStatus ?? card.videoStatus,
      audioStatus: update.audioStatus ?? card.audioStatus,
    };
  });
  rerenderUpdatedCards(part, updates);
}

async function poll(part) {
  if (!part.state.pollingIds.length) return;
  const res = await fetch(`/api/status?ids=${part.state.pollingIds.join(',')}`);
  const data = await res.json();
  let pollingIds = part.state.pollingIds;
  const patchCardStatusUpdates = [];

  for (const [id, status] of Object.entries(data)) {
    const current = part.state.cards.find((card) => card.youtubeId === id);
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

  part.set({ pollingIds, patchCardStatusUpdates });
  if (pollingIds.length)
    part.private.pollTimer = setTimeout(() => poll(part).catch(() => {}), 5000);
}

function restartPolling(part, cards) {
  clearTimeout(part.private.pollTimer);
  const pollingIds = [...new Set(pollingIdsForCards(cards))];
  part.set('pollingIds', pollingIds);
  if (pollingIds.length) poll(part).catch(() => {});
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
      if (part.state.allowDownload === false) return;
      const btn = event.target.closest('[data-action="download"]');
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      const statusUpdate =
        type === 'video' ? { id, videoStatus: 'queued' } : { id, audioStatus: 'queued' };
      const pollingIds = part.state.pollingIds.includes(id)
        ? part.state.pollingIds
        : [...part.state.pollingIds, id];
      part.set({ pollingIds, patchCardStatusUpdates: [statusUpdate] });
      await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeId: id, type }),
      });
      if (!part.private.pollTimer) poll(part).catch(() => {});
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
  },
  onMount: (part) => {
    part.private.onPopState = () => {
      loadPage(part, pageFromUrl(part), { updateUrl: false }).catch(() => {});
    };
    window.addEventListener('popstate', part.private.onPopState);
    const initialUrlPage = pageFromUrl(part);
    if (part.state.syncUrl && initialUrlPage !== part.state.page) {
      loadPage(part, initialUrlPage, { updateUrl: false }).catch(() => {});
    } else {
      restartPolling(part, part.state.cards);
    }
  },
  onDestroy: (part) => {
    window.removeEventListener('popstate', part.private.onPopState);
    part.private.pageAbort?.abort();
    clearTimeout(part.private.pollTimer);
  },
};
