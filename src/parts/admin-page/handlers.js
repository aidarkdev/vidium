import {
  jobsHead,
  channelsHead,
  renderDownloaded,
  renderChannels,
  renderJobs,
  renderProblemRows,
  renderStatuses,
  renderUsers,
  statusHead,
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

const PROBLEM_STATUSES = new Set(['queued', 'downloading', 'expired']);

function isProblemRow(row) {
  return PROBLEM_STATUSES.has(row.videoStatus) || PROBLEM_STATUSES.has(row.audioStatus);
}

function applyProblemReset(rows, resetStatus) {
  if (!resetStatus) return rows;

  return rows
    .map((row) => {
      if (row.youtubeId !== resetStatus.youtubeId) return row;

      return {
        ...row,
        videoStatus:
          resetStatus.statusType === 'video' || resetStatus.resetVideo ? 'none' : row.videoStatus,
        audioStatus:
          resetStatus.statusType === 'audio' || resetStatus.resetAudio ? 'none' : row.audioStatus,
      };
    })
    .filter(isProblemRow);
}

function bumpSummary(summary, mediaType, status, delta) {
  return summary.map((row) => {
    if (row.status !== status) return row;
    const key = mediaType === 'video' ? 'videoCount' : 'audioCount';
    return { ...row, [key]: Math.max(0, row[key] + delta) };
  });
}

function applySummaryReset(summary, beforeRow, resetStatus) {
  if (!beforeRow || !resetStatus) return summary;

  let next = summary;
  if (resetStatus.statusType === 'video' || resetStatus.resetVideo) {
    next = bumpSummary(next, 'video', beforeRow.videoStatus, -1);
    next = bumpSummary(next, 'video', 'none', 1);
  }
  if (resetStatus.statusType === 'audio' || resetStatus.resetAudio) {
    next = bumpSummary(next, 'audio', beforeRow.audioStatus, -1);
    next = bumpSummary(next, 'audio', 'none', 1);
  }
  return next;
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
        const data = await postJson('/api/admin/job/delete', { jobId });
        const beforeRow = part.state.problemRows.find(
          (row) => row.youtubeId === data.resetStatus?.youtubeId,
        );
        part.set(
          'jobs',
          part.state.jobs.filter((row) => row.id !== jobId),
        );
        if (data.resetStatus) {
          part.set({
            problemRows: applyProblemReset(part.state.problemRows, data.resetStatus),
            statusSummary: applySummaryReset(part.state.statusSummary, beforeRow, data.resetStatus),
          });
        }
      } catch (err) {
        part.set('errorMessage', err.message || part.state.actions.error);
      } finally {
        part.set('pendingAction', null);
      }
    },
    'click [data-action="admin-reset-video-status"]': async (part, event) => {
      const btn = event.target.closest('[data-action]');
      const youtubeId = btn.dataset.youtubeId;
      part.set('pendingAction', { action: 'status', id: youtubeId });
      try {
        const beforeRow = part.state.problemRows.find((row) => row.youtubeId === youtubeId);
        const data = await postJson('/api/admin/video/status/reset', { youtubeId });
        part.set({
          jobs: part.state.jobs.filter(
            (row) =>
              row.youtubeId !== youtubeId ||
              (row.type !== 'download_video' && row.type !== 'download_audio'),
          ),
          problemRows: applyProblemReset(part.state.problemRows, data.resetStatus),
          statusSummary: applySummaryReset(part.state.statusSummary, beforeRow, data.resetStatus),
        });
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
    'change [data-action="admin-channel-auto-download"]': async (part, event) => {
      const input = event.target.closest('[data-action="admin-channel-auto-download"]');
      const channelId = Number(input.dataset.channelId);
      const type = input.dataset.mediaType;
      if (!Number.isInteger(channelId) || channelId <= 1 || !['video', 'audio'].includes(type)) {
        return;
      }

      const enabled = input.checked;
      const key = type === 'video' ? 'autoDownloadVideo' : 'autoDownloadAudio';
      const pendingKey = `${channelId}:${type}`;
      part.set({
        pendingChannelAutoDownloadKey: pendingKey,
        channels: part.state.channels.map((channel) =>
          channel.id === channelId ? { ...channel, [key]: enabled } : channel,
        ),
      });
      try {
        await postJson('/api/channel/auto-download', {
          channelId,
          type,
          enabled,
        });
      } catch (err) {
        part.set({
          channels: part.state.channels.map((channel) =>
            channel.id === channelId ? { ...channel, [key]: !enabled } : channel,
          ),
          errorMessage: err.message || part.state.actions.error,
        });
      } finally {
        part.set('pendingChannelAutoDownloadKey', '');
      }
    },
    'change [data-action="admin-channel-guest-visible"]': async (part, event) => {
      const input = event.target.closest('[data-action="admin-channel-guest-visible"]');
      const channelId = Number(input.dataset.channelId);
      if (!Number.isInteger(channelId) || channelId <= 1) return;

      const enabled = input.checked;
      part.set({
        pendingChannelGuestVisibleId: channelId,
        channels: part.state.channels.map((channel) =>
          channel.id === channelId ? { ...channel, guestVisible: enabled } : channel,
        ),
      });
      try {
        await postJson('/api/channel/guest-visible', {
          channelId,
          enabled,
        });
      } catch (err) {
        part.set({
          channels: part.state.channels.map((channel) =>
            channel.id === channelId ? { ...channel, guestVisible: !enabled } : channel,
          ),
          errorMessage: err.message || part.state.actions.error,
        });
      } finally {
        part.set('pendingChannelGuestVisibleId', 0);
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
    statusSummary: (part) => {
      part.refs.statuses.innerHTML = table(
        part.state.sections.statuses,
        statusHead(part.state.cols),
        renderStatuses(part.state),
        'admin-statuses',
        part.state.contentsLink,
      );
    },
    problemRows: (part) => {
      part.refs.problemRows.innerHTML = table(
        part.state.sections.problemRows,
        videoHead(part.state.cols, true),
        renderProblemRows(part.state),
        'admin-problem-rows',
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
      for (const btn of part.root.querySelectorAll(
        'button[data-action^="admin-delete-"], button[data-action="admin-reset-video-status"]',
      )) {
        btn.disabled = false;
      }
      if (!value) return;
      const selectorByAction = {
        files: `[data-action="admin-delete-files"][data-youtube-id="${CSS.escape(value.id)}"]`,
        job: `[data-action="admin-delete-job"][data-job-id="${value.id}"]`,
        status: `[data-action="admin-reset-video-status"][data-youtube-id="${CSS.escape(value.id)}"]`,
        video: `[data-action="admin-delete-video"][data-youtube-id="${CSS.escape(value.id)}"]`,
      };
      const selector = selectorByAction[value.action];
      const btn = part.root.querySelector(selector);
      if (btn) {
        btn.disabled = true;
        btn.textContent =
          value.action === 'status' ? part.state.actions.resetting : part.state.actions.deleting;
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
    pendingChannelAutoDownloadKey: (part) => {
      part.refs.channels.innerHTML = table(
        part.state.sections.channels,
        channelsHead(part.state.cols),
        renderChannels(part.state),
        'admin-channels',
        part.state.contentsLink,
      );
    },
    pendingChannelGuestVisibleId: (part) => {
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
