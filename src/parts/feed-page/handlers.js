import { cardHtml, cardsHtml, sidebarHtml } from './template.js';

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

function rerenderUpdatedCards(part, updates) {
  for (const { id } of updates) {
    const card = part.state.cards.find((item) => item.youtubeId === id);
    const node = part.refs.cards.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!card || !node) continue;

    const fresh = document.createElement('template');
    fresh.innerHTML = cardHtml(card, part.state.strings);
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
  const cardStatusUpdates = [];
  for (const [id, status] of Object.entries(data)) {
    const current = part.state.cards.find((card) => card.youtubeId === id);
    if (
      current &&
      (current.videoStatus !== status.video || current.audioStatus !== status.audio)
    ) {
      cardStatusUpdates.push({
        id,
        videoStatus: status.video,
        audioStatus: status.audio,
      });
    }
    if (!pendingStatuses.has(status.video) && !pendingStatuses.has(status.audio)) {
      pollingIds = pollingIds.filter((item) => item !== id);
    }
  }
  part.set({ pollingIds, cardStatusUpdates });
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

function updateChannelDisplayName(channels, channelId, displayName) {
  return channels.map((channel) =>
    channel.id === channelId ? { ...channel, displayName } : channel,
  );
}

function setChannelControlsDisabled(part, channelId, disabled) {
  if (!channelId) return;
  const row = part.refs.sidebar.querySelector(`[data-channel-id="${CSS.escape(String(channelId))}"]`);
  if (!row) return;
  for (const control of row.querySelectorAll('input, button')) {
    control.disabled = disabled;
  }
}

function channelTitle(channel, displayName) {
  return displayName || channel.name;
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
      const statusUpdate =
        type === 'video' ? { id, videoStatus: 'queued' } : { id, audioStatus: 'queued' };
      const pollingIds = part.state.pollingIds.includes(id)
        ? part.state.pollingIds
        : [...part.state.pollingIds, id];
      part.set({ pollingIds, cardStatusUpdates: [statusUpdate] });
      await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeId: id, type }),
      });
      if (!part.private.pollTimer) poll(part).catch(() => {});
    },
    'click [data-action="move-channel"]': async (part, event) => {
      event.preventDefault();
      event.stopPropagation();
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
    'submit [data-action="save-channel-name"]': async (part, event) => {
      event.preventDefault();
      const form = event.target;
      const btn = form.querySelector('[data-channel-id]');
      const channelId = Number(btn.dataset.channelId);
      const displayName = form.elements.displayName.value.trim();
      if (!Number.isInteger(channelId) || channelId <= 1) return;
      part.set('savingChannelNameId', channelId);
      try {
        const res = await fetch('/api/channel/display-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, displayName }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.saved) return;
        const channel = part.state.channels.find((item) => item.id === channelId);
        const updates = {
          channels: updateChannelDisplayName(part.state.channels, channelId, displayName),
        };
        if (channelId === part.state.activeChannelId && channel) {
          updates.title = channelTitle(channel, displayName);
        }
        part.set(updates);
      } finally {
        part.set('savingChannelNameId', 0);
      }
    },
  },
  state: {
    cards: rerenderCards,
    visibleCount: rerenderCards,
    cardStatusUpdates: applyCardStatusUpdates,
    title: (part, value) => {
      part.refs.title.textContent = value;
      document.title = value;
    },
    channels: rerenderSidebar,
    sidebarOpen: (part, value) => part.refs.sidebar.classList.toggle('open', value),
    editMode: (part, value) => part.refs.sidebar.classList.toggle('edit-mode', value),
    movingChannelId: rerenderSidebar,
    savingChannelNameId: (part, value, oldValue) => {
      setChannelControlsDisabled(part, oldValue, false);
      setChannelControlsDisabled(part, value, true);
    },
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
    document.addEventListener('click', part.private.onDocClick);
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
    clearInterval(part.private.sinceTimer);
    clearTimeout(part.private.pollTimer);
  },
};
