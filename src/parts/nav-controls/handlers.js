import { fieldClass } from './template.js';

function setMsg(part, prefix, message, status) {
  part.set({ [`${prefix}Msg`]: message, [`${prefix}MsgStatus`]: status });
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export default {
  events: {
    'submit [data-action="add-channel"]': async (part, event) => {
      event.preventDefault();
      const form = event.target;
      setMsg(part, 'channel', '', '');
      const { res, data } = await postJson('/api/channel', {
        url: form.elements.url.value.trim(),
        displayName: form.elements.displayName.value.trim(),
        tags: form.elements.tags.value.trim(),
      });
      if (!res.ok) return setMsg(part, 'channel', data.error || part.state.channelError, 'error');
      if (data.status === 'exists') {
        part.set('channelDetailsOpen', false);
        return setMsg(part, 'channel', part.state.channelExists, 'warn');
      }
      part.set({
        channelDetailsOpen: false,
        channelResetRequested: part.state.channelResetRequested + 1,
      });
      setMsg(part, 'channel', part.state.channelAdded, 'ok');
    },
    'submit [data-action="add-video"]': async (part, event) => {
      event.preventDefault();
      const form = event.target;
      setMsg(part, 'video', '', '');
      const { res, data } = await postJson('/api/video', { url: form.elements.url.value.trim() });
      if (!res.ok) return setMsg(part, 'video', data.error || part.state.videoError, 'error');
      if (data.status === 'exists') {
        part.set('videoDetailsOpen', false);
        return setMsg(part, 'video', part.state.videoExists, 'warn');
      }
      part.set({
        videoDetailsOpen: false,
        videoResetRequested: part.state.videoResetRequested + 1,
      });
      setMsg(part, 'video', part.state.videoAdded, 'ok');
    },
    'change [data-action="toggle-edit"]': (part, event) => {
      part.set('sidebarEdit', event.target.checked);
    },
    'click [data-ref="summary"]': (part) => {
      queueMicrotask(() => part.set('dropdownOpen', part.refs.dropdown.open));
    },
    'toggle [data-ref="dropdown"]': (part) => {
      part.set('dropdownOpen', part.refs.dropdown.open);
    },
  },
  state: {
    sidebarEdit: (_part, value) => {
      document.dispatchEvent(new CustomEvent('vidium:sidebar-edit', { detail: { edit: value } }));
    },
    dropdownOpen: (part, value) => {
      part.refs.dropdown.open = value;
      part.refs.summary.setAttribute('aria-expanded', value ? 'true' : 'false');
    },
    channelResetRequested: (part) => {
      part.root.querySelector('[data-action="add-channel"]')?.reset();
    },
    videoResetRequested: (part) => {
      part.root.querySelector('[data-action="add-video"]')?.reset();
    },
    channelMsg: (part, value) => {
      part.refs.channelMsg.textContent = value;
    },
    channelMsgStatus: (part, value) => {
      part.refs.channelMsg.className = fieldClass(value);
    },
    videoMsg: (part, value) => {
      part.refs.videoMsg.textContent = value;
    },
    videoMsgStatus: (part, value) => {
      part.refs.videoMsg.className = fieldClass(value);
    },
    channelDetailsOpen: (part, value) => {
      part.refs.channelDetails.open = value;
    },
    videoDetailsOpen: (part, value) => {
      part.refs.videoDetails.open = value;
    },
  },
  onMount: (part) => {
    part.private.onDocClick = (event) => {
      if (!part.refs.dropdown.open) return;
      if (event.target instanceof Node && part.refs.dropdown.contains(event.target)) return;
      part.set('dropdownOpen', false);
    };
    part.private.onKey = (event) => {
      if (event.key !== 'Escape') return;
      part.set('dropdownOpen', false);
    };
    document.addEventListener('click', part.private.onDocClick);
    document.addEventListener('keydown', part.private.onKey);
  },
  onDestroy: (part) => {
    document.removeEventListener('click', part.private.onDocClick);
    document.removeEventListener('keydown', part.private.onKey);
  },
};
