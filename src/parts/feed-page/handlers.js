import { sidebarHtml } from './template.js';

function rerenderSidebar(part) {
  const fresh = document.createElement('template');
  fresh.innerHTML = sidebarHtml(part.state);
  const next = fresh.content.firstElementChild;
  part.refs.sidebar.replaceWith(next);
  part.refs.sidebar = next;
  part.refs.sidebarChannels = next.querySelector('[data-ref="sidebarChannels"]');
}

function replaceSidebarRow(part, channelId) {
  const channel = part.state.channels.find((item) => item.id === channelId);
  const row = part.refs.sidebar.querySelector(`[data-channel-id="${CSS.escape(String(channelId))}"]`);
  if (!channel || !row) return;

  const fresh = document.createElement('template');
  fresh.innerHTML = part.templates.sidebarItem(
    channel,
    part.state.activeChannelId,
    part.state.labels,
    part.state.movingChannelId,
    part.state.savingChannelNameId,
  );
  row.replaceWith(fresh.content.firstElementChild);
}

function updateChannelDisplayName(channels, channelId, displayName) {
  return channels.map((channel) =>
    channel.id === channelId ? { ...channel, displayName } : channel,
  );
}

function reorderChannels(channels, regularIds) {
  const manual = channels.filter((channel) => channel.id === 1);
  const byId = new Map(channels.filter((channel) => channel.id !== 1).map((channel) => [channel.id, channel]));
  return [...manual, ...regularIds.map((id) => byId.get(id)).filter(Boolean)];
}

function reorderTags(tags, orderedTags) {
  const byTag = new Map(tags.map((item) => [item.tag, item]));
  return orderedTags.map((tag) => byTag.get(tag)).filter(Boolean);
}

function applyPatchChannelDisplayNameUpdates(part, updates) {
  for (const { id, displayName } of updates) {
    const channel = part.state.channels.find((item) => item.id === id);
    if (!channel) continue;

    part.state.channels = updateChannelDisplayName(part.state.channels, id, displayName);
    replaceSidebarRow(part, id);
    if (id === part.state.activeChannelId) {
      part.set('title', channelTitle(channel, displayName));
    }
  }
}

function applyPatchChannelOrderIds(part, regularIds) {
  if (!regularIds.length) return;
  part.state.channels = reorderChannels(part.state.channels, regularIds);

  for (const id of regularIds) {
    const row = part.refs.sidebarChannels.querySelector(
      `[data-channel-id="${CSS.escape(String(id))}"]`,
    );
    if (row) part.refs.sidebarChannels.append(row);
  }
}

function applyPatchTagOrderTags(part, orderedTags) {
  if (!orderedTags.length) return;
  part.state.tags = reorderTags(part.state.tags, orderedTags);

  for (const tag of orderedTags) {
    const row = part.refs.sidebarChannels.querySelector(
      `[data-tag="${CSS.escape(String(tag))}"]`,
    );
    if (row) part.refs.sidebarChannels.append(row);
  }
}

function setChannelControlsDisabled(part, channelId, disabled) {
  if (!channelId) return;
  const row = part.refs.sidebar.querySelector(`[data-channel-id="${CSS.escape(String(channelId))}"]`);
  if (!row) return;
  for (const control of row.querySelectorAll('input, button')) {
    control.disabled = disabled;
  }
}

function setTagControlsDisabled(part, tag, disabled) {
  if (!tag) return;
  const row = part.refs.sidebar.querySelector(`[data-tag="${CSS.escape(String(tag))}"]`);
  if (!row) return;
  for (const control of row.querySelectorAll('button')) {
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
    'click [data-action="sidebar-mode"]': (part, event) => {
      event.stopPropagation();
      const btn = event.target.closest('[data-action="sidebar-mode"]');
      const mode = btn.dataset.mode;
      if (!['channels', 'tags'].includes(mode)) return;
      part.set('sidebarMode', mode);
      fetch('/api/sidebar/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      }).catch(() => {});
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
        part.set('patchChannelOrderIds', reordered.map((channel) => channel.id));
      } finally {
        part.set('movingChannelId', 0);
      }
    },
    'click [data-action="move-tag"]': async (part, event) => {
      event.preventDefault();
      event.stopPropagation();
      const btn = event.target.closest('[data-action="move-tag"]');
      const tag = btn.dataset.tag;
      const direction = btn.dataset.direction;
      const index = part.state.tags.findIndex((item) => item.tag === tag);
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= part.state.tags.length) return;
      part.set('movingTag', tag);
      try {
        const res = await fetch('/api/tag/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag, direction }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.moved) return;
        const reordered = [...part.state.tags];
        [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
        part.set('patchTagOrderTags', reordered.map((item) => item.tag));
      } finally {
        part.set('movingTag', '');
      }
    },
    'click [data-action="delete-tag"]': async (part, event) => {
      event.preventDefault();
      event.stopPropagation();
      const btn = event.target.closest('[data-action="delete-tag"]');
      const tag = btn.dataset.tag;
      if (!tag) return;
      if (!confirm(part.state.labels.confirmDeleteTag)) return;

      part.set('movingTag', tag);
      try {
        const res = await fetch('/api/tag/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.deleted) return;
        part.set('tags', part.state.tags.filter((item) => item.tag !== data.tag));
        if (part.state.activeTag === data.tag) window.location.href = '/feed';
      } finally {
        part.set('movingTag', '');
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
        part.set('patchChannelDisplayNameUpdates', [{ id: channelId, displayName }]);
      } finally {
        part.set('savingChannelNameId', 0);
      }
    },
  },
  state: {
    title: (part, value) => {
      part.refs.title.textContent = value;
      document.title = value;
    },
    channels: rerenderSidebar,
    tags: rerenderSidebar,
    sidebarMode: rerenderSidebar,
    patchChannelDisplayNameUpdates: applyPatchChannelDisplayNameUpdates,
    patchChannelOrderIds: applyPatchChannelOrderIds,
    patchTagOrderTags: applyPatchTagOrderTags,
    sidebarOpen: (part, value) => part.refs.sidebar.classList.toggle('open', value),
    editMode: (part, value) => part.refs.sidebar.classList.toggle('edit-mode', value),
    movingChannelId: (part, value, oldValue) => {
      setChannelControlsDisabled(part, oldValue, false);
      setChannelControlsDisabled(part, value, true);
    },
    savingChannelNameId: (part, value, oldValue) => {
      setChannelControlsDisabled(part, oldValue, false);
      setChannelControlsDisabled(part, value, true);
    },
    movingTag: (part, value, oldValue) => {
      setTagControlsDisabled(part, oldValue, false);
      setTagControlsDisabled(part, value, true);
    },
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
  },
  onDestroy: (part) => {
    document.removeEventListener('click', part.private.onDocClick);
  },
};
