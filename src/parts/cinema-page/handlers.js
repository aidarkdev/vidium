async function mutate(part, endpoint, body, href) {
  if (part.state.pending) return;
  part.set({ pending: true, error: '' });
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: part.private.abort.signal,
    });
    if (!response.ok) throw new Error('cinema request failed');
    part.set('locationHref', href);
  } catch (error) {
    if (error.name !== 'AbortError') part.set('error', part.state.labels.error);
  } finally {
    if (!part.private.abort.signal.aborted) part.set('pending', false);
  }
}

export default {
  events: {
    'submit [data-action="create"]': (part, event) => {
      event.preventDefault();
      const title = new FormData(event.target).get('title').trim();
      if (!title || title.length > 300) return part.set('error', part.state.labels.error);
      void mutate(part, '/api/admin/cinema/video', { title }, '/cinema');
    },
    'click [data-action="delete"]': (part, event) => {
      const uid = event.target.closest('[data-uid]').dataset.uid;
      const video = part.state.items.find((entry) => entry.uid === uid);
      if (!video || !window.confirm(`${video.title}\n\n${part.state.labels.confirm}`)) return;
      void mutate(
        part,
        '/api/admin/cinema/video/delete',
        { uid },
        `/cinema?page=${part.state.page}`,
      );
    },
  },
  state: {
    error: (part, value) => {
      part.refs.error.textContent = value;
    },
    pending: (part, value) => {
      for (const button of part.root.querySelectorAll('button')) button.disabled = value;
    },
    locationHref: (_part, value) => {
      if (value) location.assign(value);
    },
  },
  onMount: (part) => {
    part.private.abort = new AbortController();
  },
  onDestroy: (part) => {
    part.private.abort.abort();
  },
};
