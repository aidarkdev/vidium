import { cardsHtml, sidebarHtml } from './template.js';

const PAGE_SIZE = 21;
const pendingStatuses = new Set(['queued', 'downloading']);

function rerenderCards(part) {
  part.refs.cards.innerHTML = cardsHtml(part.state);
  part.refs.more.style.display =
    part.state.visibleCount < part.state.cards.length ? 'block' : 'none';
}

function rerenderSidebar(part) {
  const fresh = document.createElement('template');
  fresh.innerHTML = sidebarHtml(part.state);
  const next = fresh.content.firstElementChild;
  part.refs.sidebar.replaceWith(next);
  part.refs.sidebar = next;
  part.refs.sidebarChannels = next.querySelector('[data-ref="sidebarChannels"]');
}

function updateCardStatus(cards, id, videoStatus, audioStatus) {
  return cards.map((card) =>
    card.youtubeId === id ? { ...card, videoStatus, audioStatus } : card,
  );
}

async function poll(part) {
  if (!part.state.pollingIds.length) return;
  const res = await fetch(`/api/status?ids=${part.state.pollingIds.join(',')}`);
  const data = await res.json();
  let cards = part.state.cards;
  let pollingIds = part.state.pollingIds;
  for (const [id, status] of Object.entries(data)) {
    cards = updateCardStatus(cards, id, status.video, status.audio);
    if (!pendingStatuses.has(status.video) && !pendingStatuses.has(status.audio)) {
      pollingIds = pollingIds.filter((item) => item !== id);
    }
  }
  part.set({ cards, pollingIds });
  if (pollingIds.length)
    part.private.pollTimer = setTimeout(() => poll(part).catch(() => {}), 5000);
}

async function checkSince(part) {
  const params = new URLSearchParams({ t: String(part.state.since) });
  if (part.state.activeChannelId) params.set('channelId', String(part.state.activeChannelId));
  else params.set('tag', part.state.activeTag || 'all');
  const res = await fetch(`/api/since?${params.toString()}`);
  const items = await res.json();
  if (!items.length) return;
  const known = new Set(part.state.cards.map((card) => card.youtubeId));
  const fresh = items.filter((item) => !known.has(item.youtubeId));
  if (!fresh.length) return;
  part.set({
    cards: [...fresh, ...part.state.cards],
    visibleCount: part.state.visibleCount + fresh.length,
    since: Date.now(),
  });
}

export default {
  events: {
    'click [data-action="toggle-sidebar"]': (part) =>
      part.set('sidebarOpen', !part.state.sidebarOpen),
    'click [data-action="more"]': (part) =>
      part.set(
        'visibleCount',
        Math.min(part.state.cards.length, part.state.visibleCount + PAGE_SIZE),
      ),
    'click [data-action="download"]': async (part, event) => {
      const btn = event.target.closest('[data-action="download"]');
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      const statusKey = type === 'video' ? 'videoStatus' : 'audioStatus';
      const cards = part.state.cards.map((card) =>
        card.youtubeId === id ? { ...card, [statusKey]: 'queued' } : card,
      );
      const pollingIds = part.state.pollingIds.includes(id)
        ? part.state.pollingIds
        : [...part.state.pollingIds, id];
      part.set({ cards, pollingIds });
      await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeId: id, type }),
      });
      if (!part.private.pollTimer) poll(part).catch(() => {});
    },
    'click [data-action="move-channel"]': async (part, event) => {
      event.preventDefault();
      const btn = event.target.closest('[data-action="move-channel"]');
      const channelId = Number(btn.dataset.channelId);
      const direction = btn.dataset.direction;
      const regular = part.state.channels.filter((ch) => ch.id !== 1);
      const index = regular.findIndex((ch) => ch.id === channelId);
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= regular.length) return;
      part.set('movingChannelId', channelId);
      try {
        const res = await fetch('/api/channel/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, direction }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.moved) return;
        const reordered = [...regular];
        [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
        const manual = part.state.channels.filter((ch) => ch.id === 1);
        part.set('channels', [...manual, ...reordered]);
      } finally {
        part.set('movingChannelId', 0);
      }
    },
  },
  state: {
    cards: rerenderCards,
    visibleCount: rerenderCards,
    channels: rerenderSidebar,
    sidebarOpen: (part, value) => part.refs.sidebar.classList.toggle('open', value),
    editMode: (part, value) => part.refs.sidebar.classList.toggle('edit-mode', value),
    movingChannelId: rerenderSidebar,
    pollingIds: () => {},
    since: () => {},
  },
  onMount: (part) => {
    part.private.onDocClick = (event) => {
      if (!part.state.sidebarOpen) return;
      if (
        event.target instanceof Node &&
        (part.refs.sidebar.contains(event.target) ||
          event.target.closest?.('[data-action="toggle-sidebar"]'))
      )
        return;
      part.set('sidebarOpen', false);
    };
    part.private.onEdit = (event) => part.set('editMode', !!event.detail?.edit);
    document.addEventListener('click', part.private.onDocClick);
    document.addEventListener('vidium:sidebar-edit', part.private.onEdit);
    part.private.sinceTimer = setInterval(() => checkSince(part).catch(() => {}), 60000);
    const initialPolling = part.state.cards
      .filter(
        (card) => pendingStatuses.has(card.videoStatus) || pendingStatuses.has(card.audioStatus),
      )
      .map((card) => card.youtubeId);
    if (initialPolling.length) {
      part.set('pollingIds', [...new Set(initialPolling)]);
      poll(part).catch(() => {});
    }
  },
  onDestroy: (part) => {
    document.removeEventListener('click', part.private.onDocClick);
    document.removeEventListener('vidium:sidebar-edit', part.private.onEdit);
    clearInterval(part.private.sinceTimer);
    clearTimeout(part.private.pollTimer);
  },
};
