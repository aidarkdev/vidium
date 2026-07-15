import { itemsHtml } from './template.js';

const STORAGE_KEY = 'vidium:media-queue:v1';
const UID_RE = /^[A-Za-z0-9_-]{16,22}$/;
const pendingStatuses = new Set(['queued', 'downloading']);

function normalizeItem(value) {
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

function normalizeItems(values) {
  if (!Array.isArray(values)) return [];
  const byKey = new Map();
  for (const value of values) {
    const item = normalizeItem(value);
    if (!item) continue;
    const key = `${item.type}:${item.uid}`;
    const current = byKey.get(key);
    if (!current || current.addedAt <= item.addedAt) byKey.set(key, item);
  }
  return [...byKey.values()].sort((a, b) => b.addedAt - a.addedAt);
}

function readItems() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { items: [], storageError: true };
  }

  if (!raw) return { items: [], storageError: false };
  try {
    return { items: normalizeItems(JSON.parse(raw)), storageError: false };
  } catch {
    return { items: [], storageError: false };
  }
}

function stopPolling(part) {
  clearTimeout(part.private.pollTimer);
  part.private.pollTimer = null;
  part.private.pollAbort?.abort();
  part.private.pollAbort = null;
}

function pendingIds(part) {
  return [
    ...new Set(
      part.state.items
        .filter((item) => pendingStatuses.has(item.status))
        .map((item) => item.uid),
    ),
  ];
}

function schedulePoll(part, delay) {
  if (part.private.destroyed) return;
  clearTimeout(part.private.pollTimer);
  part.private.pollTimer = setTimeout(() => {
    part.private.pollTimer = null;
    poll(part).catch(() => {});
  }, delay);
}

async function poll(part) {
  if (part.private.destroyed || !part.state.open) return;
  const ids = pendingIds(part);
  if (!ids.length) return;

  part.private.pollAbort?.abort();
  part.private.pollAbort = new AbortController();

  try {
    const params = new URLSearchParams({ ids: ids.join(',') });
    const res = await fetch(`/api/status?${params}`, { signal: part.private.pollAbort.signal });
    if (!res.ok) throw new Error('request failed');
    const statuses = await res.json();
    let changed = false;
    const items = part.state.items.map((item) => {
      const status = statuses[item.uid]?.[item.type];
      if (typeof status !== 'string' || status === item.status) return item;
      changed = true;
      return { ...item, status };
    });
    if (changed) part.set('items', items);
  } catch (error) {
    if (error?.name === 'AbortError') return;
  } finally {
    part.private.pollAbort = null;
    if (!part.private.destroyed && part.state.open && pendingIds(part).length) {
      schedulePoll(part, 5000);
    }
  }
}

export default {
  events: {
    'click [data-action="open"]': (part) => {
      const stored = readItems();
      part.set({
        items: stored.items,
        storageError: stored.storageError,
        open: true,
      });
    },
    'click [data-action="close"]': (part) => {
      part.set('open', false);
    },
    'click [data-action="remove"]': (part, event) => {
      const button = event.target.closest('[data-action="remove"]');
      const { uid, type } = button.dataset;
      part.set(
        'items',
        part.state.items.filter((item) => item.uid !== uid || item.type !== type),
      );
    },
  },
  state: {
    items: (part, items) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        if (!part.state.storageError) part.set('storageError', true);
      }
      part.refs.items.innerHTML = itemsHtml(part.state);
    },
    storageError: (part) => {
      part.refs.items.innerHTML = itemsHtml(part.state);
    },
    open: (part, open) => {
      if (open) {
        if (!part.refs.dialog.open) part.refs.dialog.showModal();
        schedulePoll(part, 0);
      } else {
        stopPolling(part);
        if (part.refs.dialog.open) part.refs.dialog.close();
      }
    },
  },
  onMount: (part) => {
    part.private.onKey = (event) => {
      if (event.key !== 'Escape' || !part.state.open) return;
      event.preventDefault();
      part.set('open', false);
    };
    document.addEventListener('keydown', part.private.onKey);
  },
  onDestroy: (part) => {
    part.private.destroyed = true;
    document.removeEventListener('keydown', part.private.onKey);
    stopPolling(part);
  },
};
