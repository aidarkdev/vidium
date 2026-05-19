import { escape as htmlEscape } from '../../engine/core.js';

function rows(items, render, empty, colspan) {
  return items.length
    ? items.map(render).join('')
    : `<tr><td colspan="${colspan}">${htmlEscape(empty)}</td></tr>`;
}

const ADMIN_CONTENTS_ID = 'admin-contents';

const ADMIN_SECTIONS = [
  ['channels', 'admin-channels'],
  ['jobs', 'admin-jobs'],
  ['users', 'admin-users'],
  ['statuses', 'admin-statuses'],
  ['problemRows', 'admin-problem-rows'],
  ['downloaded', 'admin-downloaded'],
];

function contentsLinks(state) {
  const sections = ADMIN_SECTIONS.map(([key, sectionId]) => [state.sections[key], sectionId]);
  if (state.diskStatus) sections.unshift([state.disk.title, 'admin-disk']);
  if (state.proxyStatus) sections.unshift([state.proxy.title, 'admin-proxy']);
  const links = sections
    .map(([label, sectionId]) => `<li><a href="#${sectionId}">${htmlEscape(label)}</a></li>`)
    .join('');

  return `<nav id="${ADMIN_CONTENTS_ID}" class="admin-contents" aria-label="${htmlEscape(state.contentsTitle)}">
    <h2>${htmlEscape(state.contentsTitle)}</h2>
    <ol>${links}</ol>
  </nav>`;
}

function proxyStatusLabel(state) {
  if (state.proxyStatus.state === 'ok') return state.proxy.ok;
  if (state.proxyStatus.state === 'failed') return state.proxy.failed;
  return state.proxy.invalid;
}

function diskStatusLabel(state) {
  if (state.diskStatus.state === 'free') return state.disk.free;
  if (state.diskStatus.state === 'busy') return state.disk.busy;
  return state.disk.invalid;
}

function formatCheckedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.hour}:${byType.minute} ${byType.timeZoneName} ${byType.day}-${byType.month}-${byType.year}`;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 GB';

  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value / 1024 / 1024 / 1024)} GB`;
}

function renderDiskStatus(state) {
  if (!state.diskStatus) return '';

  const statusClass = `admin-disk-status-${state.diskStatus.state}`;
  const details =
    state.diskStatus.state === 'invalid'
      ? ''
      : `<span>${htmlEscape(state.disk.used)}: ${htmlEscape(formatBytes(state.diskStatus.usedBytes))}</span>
      <span>${htmlEscape(state.disk.available)}: ${htmlEscape(formatBytes(state.diskStatus.freeBytes))}</span>
      <span>${htmlEscape(state.disk.total)}: ${htmlEscape(formatBytes(state.diskStatus.totalBytes))}</span>
      <span>${htmlEscape(state.disk.usage)}: ${htmlEscape(String(state.diskStatus.usagePercent))}%</span>
      <span>${htmlEscape(state.disk.cleanupAt)}: ${htmlEscape(String(state.diskStatus.cleanupPercent))}%</span>`;
  const error = state.diskStatus.error
    ? `<span class="admin-status-error">${htmlEscape(state.disk.error)}: ${htmlEscape(state.diskStatus.error)}</span>`
    : '';

  return `<section class="admin-system-status admin-disk-status ${statusClass}">
    <h2 id="admin-disk">
      <span>${htmlEscape(state.disk.title)}</span>
      <a class="admin-back-link" href="#${ADMIN_CONTENTS_ID}">${htmlEscape(state.contentsLink)}</a>
    </h2>
    <div class="admin-system-status-line">
      <strong>${htmlEscape(diskStatusLabel(state))}</strong>
      ${details}
      ${error}
    </div>
  </section>`;
}

function renderProxyStatus(state) {
  if (!state.proxyStatus) return '';

  const statusClass = `admin-proxy-status-${state.proxyStatus.state}`;
  const checkedAt = state.proxyStatus.checkedAt
    ? `<span>${htmlEscape(state.proxy.checkedAt)}: ${htmlEscape(formatCheckedAt(state.proxyStatus.checkedAt))}</span>`
    : '';
  const error = state.proxyStatus.error
    ? `<span class="admin-status-error">${htmlEscape(state.proxy.error)}: ${htmlEscape(state.proxyStatus.error)}</span>`
    : '';

  return `<section class="admin-system-status admin-proxy-status ${statusClass}">
    <h2 id="admin-proxy">
      <span>${htmlEscape(state.proxy.title)}</span>
      <a class="admin-back-link" href="#${ADMIN_CONTENTS_ID}">${htmlEscape(state.contentsLink)}</a>
    </h2>
    <div class="admin-system-status-line">
      <strong>${htmlEscape(proxyStatusLabel(state))}</strong>
      ${checkedAt}
      ${error}
    </div>
  </section>`;
}

export function table(title, head, body, sectionId, contentsLabel) {
  return `<section class="admin-section">
    <h2 id="${sectionId}">
      <span>${htmlEscape(title)}</span>
      <a class="admin-back-link" href="#${ADMIN_CONTENTS_ID}">${htmlEscape(contentsLabel)}</a>
    </h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

export function jobsHead(s) {
  return `<tr>
    <th>${htmlEscape(s.id)}</th>
    <th>${htmlEscape(s.type)}</th>
    <th>${htmlEscape(s.status)}</th>
    <th>${htmlEscape(s.attempts)}</th>
    <th>${htmlEscape(s.youtubeId)}</th>
    <th>${htmlEscape(s.error)}</th>
    <th>${htmlEscape(s.createdAt)}</th>
    <th>${htmlEscape(s.actions)}</th>
  </tr>`;
}

export function statusHead(s) {
  return `<tr>
    <th>${htmlEscape(s.status)}</th>
    <th>${htmlEscape(s.video)}</th>
    <th>${htmlEscape(s.audio)}</th>
  </tr>`;
}

export function channelsHead(s) {
  return `<tr>
    <th>${htmlEscape(s.id)}</th>
    <th>${htmlEscape(s.channel)}</th>
    <th>${htmlEscape(s.url)}</th>
    <th>${htmlEscape(s.tags)}</th>
    <th>${htmlEscape(s.autoVideo)}</th>
    <th>${htmlEscape(s.autoAudio)}</th>
    <th>${htmlEscape(s.actions)}</th>
  </tr>`;
}

export function usersHead(s) {
  return `<tr>
    <th>${htmlEscape(s.id)}</th>
    <th>${htmlEscape(s.login)}</th>
    <th>${htmlEscape(s.admin)}</th>
    <th>${htmlEscape(s.createdAt)}</th>
  </tr>`;
}

export function videoHead(s, actions) {
  return `<tr>
    <th>${htmlEscape(s.youtubeId)}</th>
    <th>${htmlEscape(s.title)}</th>
    <th>${htmlEscape(s.video)}</th>
    <th>${htmlEscape(s.audio)}</th>
    <th>${htmlEscape(s.readyAt)}</th>
    <th>${htmlEscape(s.createdAt)}</th>
    ${actions ? `<th>${htmlEscape(s.actions)}</th>` : ''}
  </tr>`;
}

function userRow(user, state) {
  const isSelf = user.id === state.currentUserId;
  const isPending = user.id === state.pendingUserRoleId;
  const disabled = isSelf || isPending;

  return `<tr data-user-id="${user.id}">
    <td>${user.id}</td>
    <td>${htmlEscape(user.login)}</td>
    <td>
      <input
        type="checkbox"
        data-action="admin-user-role"
        data-user-id="${user.id}"
        ${user.role === 'admin' ? 'checked' : ''}
        ${disabled ? 'disabled' : ''}
      >
    </td>
    <td>${htmlEscape(user.createdAt)}</td>
  </tr>`;
}

export function renderUsers(state) {
  return rows(state.users, (user) => userRow(user, state), state.empty, 4);
}

function channelRow(channel, state) {
  const disabled = channel.id === 1 || channel.id === state.pendingChannelTagsId;
  const label = channel.displayName || channel.name;
  const formId = `admin-channel-tags-${channel.id}`;
  const videoAutoKey = `${channel.id}:video`;
  const audioAutoKey = `${channel.id}:audio`;
  const videoAutoDisabled =
    channel.id === 1 || state.pendingChannelAutoDownloadKey === videoAutoKey;
  const audioAutoDisabled =
    channel.id === 1 || state.pendingChannelAutoDownloadKey === audioAutoKey;

  return `<tr data-channel-id="${channel.id}">
    <td>${channel.id}</td>
    <td>${htmlEscape(label)}</td>
    <td>${htmlEscape(channel.url)}</td>
    <td>
      <form
        id="${formId}"
        class="admin-inline-form"
        data-action="admin-channel-tags"
        data-channel-id="${channel.id}"
      >
        <input
          name="tags"
          value="${htmlEscape(channel.tags || '')}"
          autocomplete="off"
          ${disabled ? 'disabled' : ''}
        >
      </form>
    </td>
    <td>
      ${
        channel.id === 1
          ? ''
          : `<input
            type="checkbox"
            data-action="admin-channel-auto-download"
            data-channel-id="${channel.id}"
            data-media-type="video"
            ${channel.autoDownloadVideo ? 'checked' : ''}
            ${videoAutoDisabled ? 'disabled' : ''}
          >`
      }
    </td>
    <td>
      ${
        channel.id === 1
          ? ''
          : `<input
            type="checkbox"
            data-action="admin-channel-auto-download"
            data-channel-id="${channel.id}"
            data-media-type="audio"
            ${channel.autoDownloadAudio ? 'checked' : ''}
            ${audioAutoDisabled ? 'disabled' : ''}
          >`
      }
    </td>
    <td>
      <button
        class="btn admin-btn"
        type="submit"
        form="${formId}"
        data-channel-id="${channel.id}"
        ${disabled ? 'disabled' : ''}
      >${htmlEscape(state.actions.save)}</button>
    </td>
  </tr>`;
}

export function renderChannels(state) {
  return rows(state.channels, (channel) => channelRow(channel, state), state.empty, 7);
}

function jobRow(job, state) {
  return `<tr>
    <td>${job.id}</td>
    <td>${htmlEscape(job.type)}</td>
    <td>${htmlEscape(job.status)}</td>
    <td>${job.attempts}</td>
    <td>${htmlEscape(job.youtubeId)}</td>
    <td>${htmlEscape(job.error)}</td>
    <td>${htmlEscape(job.createdAt)}</td>
    <td>
      <button
        class="btn admin-btn admin-btn-danger"
        data-action="admin-delete-job"
        data-job-id="${job.id}"
      >${htmlEscape(state.actions.deleteJob)}</button>
    </td>
  </tr>`;
}

export function renderJobs(state) {
  return rows(state.jobs, (job) => jobRow(job, state), state.empty, 8);
}

export function renderStatuses(state) {
  return state.statusSummary
    .map(
      (row) => `<tr>
        <td>${htmlEscape(row.status)}</td>
        <td>${row.videoCount}</td>
        <td>${row.audioCount}</td>
      </tr>`,
    )
    .join('');
}

function statusRow(row, state) {
  return `<tr>
    <td>${htmlEscape(row.youtubeId)}</td>
    <td>${htmlEscape(row.title)}</td>
    <td>${htmlEscape(row.videoStatus)}</td>
    <td>${htmlEscape(row.audioStatus)}</td>
    <td>${htmlEscape(row.readyAt)}</td>
    <td>${htmlEscape(row.createdAt)}</td>
    <td class="admin-actions-cell">
      <button
        class="btn admin-btn"
        data-action="admin-reset-video-status"
        data-youtube-id="${htmlEscape(row.youtubeId)}"
      >${htmlEscape(state.actions.resetStatus)}</button>
    </td>
  </tr>`;
}

export function renderProblemRows(state) {
  return rows(state.problemRows, (row) => statusRow(row, state), state.empty, 7);
}

function downloadedRow(row, state) {
  return `<tr data-video-row="${htmlEscape(row.youtubeId)}">
    <td>${htmlEscape(row.youtubeId)}</td>
    <td>${htmlEscape(row.title)}</td>
    <td>${htmlEscape(row.videoStatus)}</td>
    <td>${htmlEscape(row.audioStatus)}</td>
    <td>${htmlEscape(row.readyAt)}</td>
    <td>${htmlEscape(row.createdAt)}</td>
    <td class="admin-actions-cell">
      <button
        class="btn admin-btn"
        data-action="admin-delete-files"
        data-youtube-id="${htmlEscape(row.youtubeId)}"
      >${htmlEscape(state.actions.deleteFiles)}</button>
      <button
        class="btn admin-btn admin-btn-danger"
        data-action="admin-delete-video"
        data-youtube-id="${htmlEscape(row.youtubeId)}"
      >${htmlEscape(state.actions.deleteVideo)}</button>
    </td>
  </tr>`;
}

export function renderDownloaded(state) {
  return rows(state.downloadedVideos, (row) => downloadedRow(row, state), state.empty, 7);
}

export default function template(state) {
  return `<section class="admin-page">
    <div class="topbar">
      <span class="topbar-label">${htmlEscape(state.title)}</span>
    </div>
    ${contentsLinks(state)}
    ${renderProxyStatus(state)}
    ${renderDiskStatus(state)}
    <div data-ref="channels">
      ${table(state.sections.channels, channelsHead(state.cols), renderChannels(state), 'admin-channels', state.contentsLink)}
    </div>
    <div data-ref="jobs">
      ${table(state.sections.jobs, jobsHead(state.cols), renderJobs(state), 'admin-jobs', state.contentsLink)}
    </div>
    <div data-ref="users">
      ${table(state.sections.users, usersHead(state.cols), renderUsers(state), 'admin-users', state.contentsLink)}
    </div>
    <div data-ref="statuses">
      ${table(state.sections.statuses, statusHead(state.cols), renderStatuses(state), 'admin-statuses', state.contentsLink)}
    </div>
    <div data-ref="problemRows">
      ${table(state.sections.problemRows, videoHead(state.cols, true), renderProblemRows(state), 'admin-problem-rows', state.contentsLink)}
    </div>
    <div data-ref="downloaded">
      ${table(state.sections.downloaded, videoHead(state.cols, true), renderDownloaded(state), 'admin-downloaded', state.contentsLink)}
    </div>
  </section>`;
}
