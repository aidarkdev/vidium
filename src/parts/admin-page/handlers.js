import {
  jobsHead,
  channelsHead,
  renderDownloaded,
  renderChannels,
  renderJobs,
  renderUsers,
  table,
  usersHead,
  videoHead,
} from './template.js';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'error');
  return data;
}

export default {
  events: {
    'click [data-action="admin-delete-files"]': async (part, event) => {
      const btn = event.target.closest('[data-action]');
      const youtubeId = btn.dataset.youtubeId;
      if (!confirm(part.state.confirm.deleteFiles)) return;
      part.set('pendingAction', { action: 'files', id: youtubeId });
      try {
        await postJson('/api/admin/video/files/delete', { youtubeId });
        part.set('eventReload', part.state.eventReload + 1);
      } catch (err) {
        part.set('errorMessage', err.message || part.state.actions.error);
      } finally {
        part.set('pendingAction', null);
      }
    },
    'click [data-action="admin-delete-video"]': async (part, event) => {
      const btn = event.target.closest('[data-action]');
      const youtubeId = btn.dataset.youtubeId;
      if (!confirm(part.state.confirm.deleteVideo)) return;
      part.set('pendingAction', { action: 'video', id: youtubeId });
      try {
        await postJson('/api/admin/video/delete', { youtubeId });
        part.set(
          'downloadedVideos',
          part.state.downloadedVideos.filter((row) => row.youtubeId !== youtubeId),
        );
      } catch (err) {
        part.set('errorMessage', err.message || part.state.actions.error);
      } finally {
        part.set('pendingAction', null);
      }
    },
    'click [data-action="admin-delete-job"]': async (part, event) => {
      const btn = event.target.closest('[data-action]');
      const jobId = Number(btn.dataset.jobId);
      if (!confirm(part.state.confirm.deleteJob)) return;
      part.set('pendingAction', { action: 'job', id: String(jobId) });
      try {
        await postJson('/api/admin/job/delete', { jobId });
        part.set(
          'jobs',
          part.state.jobs.filter((row) => row.id !== jobId),
        );
      } catch (err) {
        part.set('errorMessage', err.message || part.state.actions.error);
      } finally {
        part.set('pendingAction', null);
      }
    },
    'change [data-action="admin-user-role"]': async (part, event) => {
      const input = event.target.closest('[data-action="admin-user-role"]');
      const userId = Number(input.dataset.userId);
      const role = input.checked ? 'admin' : 'user';
      const previousRole = input.checked ? 'user' : 'admin';
      part.set({
        pendingUserRoleId: userId,
        users: part.state.users.map((user) => (user.id === userId ? { ...user, role } : user)),
      });
      try {
        await postJson('/api/admin/user/role', { userId, role });
      } catch (err) {
        part.set({
          users: part.state.users.map((user) =>
            user.id === userId ? { ...user, role: previousRole } : user,
          ),
          errorMessage: err.message || part.state.actions.error,
        });
      } finally {
        part.set('pendingUserRoleId', 0);
      }
    },
    'submit [data-action="admin-channel-tags"]': async (part, event) => {
      event.preventDefault();
      const form = event.target;
      const channelId = Number(form.dataset.channelId);
      const tags = String(new FormData(form).get('tags') || '').trim();
      if (!Number.isInteger(channelId) || channelId <= 1) return;

      part.set('pendingChannelTagsId', channelId);
      try {
        const data = await postJson('/api/channel/tags', {
          channelId,
          tags,
        });
        const channels = part.state.channels.map((channel) =>
          channel.id === channelId ? { ...channel, tags: data.tags } : channel,
        );
        part.set('channels', channels);
      } catch (err) {
        part.set('errorMessage', err.message || part.state.actions.error);
      } finally {
        part.set('pendingChannelTagsId', 0);
      }
    },
  },
  state: {
    channels: (part) => {
      part.refs.channels.innerHTML = table(
        part.state.sections.channels,
        channelsHead(part.state.cols),
        renderChannels(part.state),
        'admin-channels',
        part.state.contentsLink,
      );
    },
    users: (part) => {
      part.refs.users.innerHTML = table(
        part.state.sections.users,
        usersHead(part.state.cols),
        renderUsers(part.state),
        'admin-users',
        part.state.contentsLink,
      );
    },
    jobs: (part) => {
      part.refs.jobs.innerHTML = table(
        part.state.sections.jobs,
        jobsHead(part.state.cols),
        renderJobs(part.state),
        'admin-jobs',
        part.state.contentsLink,
      );
    },
    downloadedVideos: (part) => {
      part.refs.downloaded.innerHTML = table(
        part.state.sections.downloaded,
        videoHead(part.state.cols, true),
        renderDownloaded(part.state),
        'admin-downloaded',
        part.state.contentsLink,
      );
    },
    pendingAction: (part, value) => {
      for (const btn of part.root.querySelectorAll('button[data-action^="admin-delete-"]')) {
        btn.disabled = false;
      }
      if (!value) return;
      const selector =
        value.action === 'job'
          ? `[data-job-id="${value.id}"]`
          : `[data-youtube-id="${CSS.escape(value.id)}"]`;
      const btn = part.root.querySelector(selector);
      if (btn) {
        btn.disabled = true;
        btn.textContent = part.state.actions.deleting;
      }
    },
    pendingUserRoleId: (part) => {
      part.refs.users.innerHTML = table(
        part.state.sections.users,
        usersHead(part.state.cols),
        renderUsers(part.state),
        'admin-users',
        part.state.contentsLink,
      );
    },
    pendingChannelTagsId: (part) => {
      part.refs.channels.innerHTML = table(
        part.state.sections.channels,
        channelsHead(part.state.cols),
        renderChannels(part.state),
        'admin-channels',
        part.state.contentsLink,
      );
    },
    errorMessage: (_part, value) => {
      if (value) alert(value);
    },
    eventReload: () => window.location.reload(),
  },
};
