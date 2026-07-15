import { escape as htmlEscape } from '../../engine/core.js';

export function formatCountdown(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, '0')}`;
}

function mediaHtml(state) {
  if (state.kind === 'video') {
    return `<video
      data-ref="media"
      id="video-player"
      controls
      playsinline
      preload="metadata"
      src="${htmlEscape(state.mediaSrc)}"
    ></video>`;
  }

  return `<img
    class="player-thumb"
    src="${htmlEscape(state.thumbSrc)}"
    alt="${htmlEscape(state.title)}"
  >
  <audio
    data-ref="media"
    id="audio-player"
    controls
    preload="metadata"
    src="${htmlEscape(state.mediaSrc)}"
  ></audio>`;
}

function channelHtml(state) {
  if (!state.channelName) return '';
  if (!state.channelId) return `<div class="player-channel">${htmlEscape(state.channelName)}</div>`;

  return `<a class="player-channel" href="/channel/${htmlEscape(String(state.channelId))}">${htmlEscape(state.channelName)}</a>`;
}

function shareHtml(state) {
  if (!state.shareAvailable) return '';

  return `<button data-action="share" data-ref="shareButton" type="button">
    ${htmlEscape(state.shareLabel)}
  </button>`;
}

function sleepAvailable(state) {
  const mediaDuration = Number(state.mediaDurationSeconds);
  const sleepDuration = Number(state.sleepDurationSeconds);
  return (
    Number.isFinite(mediaDuration) &&
    Number.isFinite(sleepDuration) &&
    mediaDuration >= sleepDuration
  );
}

function formatChapterTime(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function chaptersHtml(state) {
  if (!Array.isArray(state.chapters) || state.chapters.length === 0) return '';

  const chapters = state.chapters
    .map(
      (chapter) => `<button
        class="player-chapter"
        type="button"
        data-action="chapter-seek"
        data-chapter-start="${htmlEscape(String(chapter.start))}"
      >
        <span class="player-chapter-time">${htmlEscape(formatChapterTime(chapter.start))}</span>
        <span class="player-chapter-title">${htmlEscape(chapter.title)}</span>
      </button>`,
    )
    .join('');

  return `<div class="player-chapters">${chapters}</div>`;
}

function playIcon() {
  return `<svg class="player-play-icon player-play-icon-play" viewBox="0 0 13 24" fill="none" aria-hidden="true">
    <path
      d="M3 7.20608V16.7939C3 17.7996 3 18.3024 3.19886 18.5352C3.37141 18.7373 3.63025 18.8445 3.89512 18.8236C4.20038 18.7996 4.55593 18.4441 5.26704 17.733L10.061 12.939C10.3897 12.6103 10.554 12.446 10.6156 12.2565C10.6697 12.0898 10.6697 11.9102 10.6156 11.7435C10.554 11.554 10.3897 11.3897 10.061 11.061L5.26704 6.26704C4.55593 5.55593 4.20038 5.20038 3.89512 5.17636C3.63025 5.15551 3.37141 5.26273 3.19886 5.46476C3 5.69759 3 6.20042 3 7.20608Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    ></path>
  </svg>`;
}

function pauseIcon() {
  return `<svg class="player-play-icon player-play-icon-pause" viewBox="12 0 12 24" fill="none" aria-hidden="true">
    <path
      d="M15 5V19M21 5V19"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    ></path>
  </svg>`;
}

export default function template(state) {
  return `<div class="player">
    ${mediaHtml(state)}
    <div class="player-seek">
      <button class="player-back" data-action="back" type="button">
        &larr; ${htmlEscape(state.backLabel)}
      </button>
      <div class="player-seek-main">
        <button type="button" data-action="seek" data-seek="-30">-30s</button>
        <button type="button" data-action="seek" data-seek="-15">-15s</button>
        <button
          class="player-playpause is-paused"
          data-action="toggle-play"
          data-ref="playButton"
          type="button"
        >
          ${playIcon()}
          ${pauseIcon()}
        </button>
        <button type="button" data-action="seek" data-seek="15">+15s</button>
        <button type="button" data-action="seek" data-seek="30">+30s</button>
      </div>
      <div class="player-actions">
        ${shareHtml(state)}
        <div
          class="player-sleep-controls"
          data-ref="sleepControls"
          ${sleepAvailable(state) ? '' : 'hidden'}
        >
          <button
            class="player-sleep-button"
            data-action="sleep"
            data-ref="sleepButton"
            type="button"
          >${htmlEscape(state.sleepLabel)}</button>
          <span class="player-sleep-countdown" data-ref="sleepCountdown">
            ${formatCountdown(state.sleepRemainingSeconds)}
          </span>
        </div>
      </div>
      <button
        class="player-rate"
        data-action="toggle-rate"
        data-ref="rateButton"
        type="button"
      >1.25x</button>
    </div>
    <div class="player-title">
      ${channelHtml(state)}
      <div class="player-title-text">${htmlEscape(state.title)}</div>
    </div>
    ${chaptersHtml(state)}
  </div>`;
}
