import { escape as htmlEscape } from '../../engine/core.js';

function rows(items, render, empty, colspan) {
  return items.length
    ? items.map(render).join('')
    : `<tr><td colspan="${colspan}">${htmlEscape(empty)}</td></tr>`;
}

export function table(title, head, body) {
  return `<section class="admin-section">
    <h2>${htmlEscape(title)}</h2>
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

function statusRow(row) {
  return `<tr>
    <td>${htmlEscape(row.youtubeId)}</td>
    <td>${htmlEscape(row.title)}</td>
    <td>${htmlEscape(row.videoStatus)}</td>
    <td>${htmlEscape(row.audioStatus)}</td>
    <td>${htmlEscape(row.readyAt)}</td>
    <td>${htmlEscape(row.createdAt)}</td>
  </tr>`;
}

export function renderProblemRows(state) {
  return rows(state.problemRows, statusRow, state.empty, 6);
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
    <div data-ref="jobs">
      ${table(state.sections.jobs, jobsHead(state.cols), renderJobs(state))}
    </div>
    <div data-ref="statuses">
      ${table(state.sections.statuses, statusHead(state.cols), renderStatuses(state))}
    </div>
    <div data-ref="problemRows">
      ${table(state.sections.problemRows, videoHead(state.cols, false), renderProblemRows(state))}
    </div>
    <div data-ref="downloaded">
      ${table(state.sections.downloaded, videoHead(state.cols, true), renderDownloaded(state))}
    </div>
  </section>`;
}
