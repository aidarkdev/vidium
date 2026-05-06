import { escape as htmlEscape } from '../../engine/core.js';

function mediaHtml(state) {
  if (state.kind === 'video') {
    return `<video
      data-ref="media"
      id="video-player"
      controls
      autoplay
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
    autoplay
    preload="metadata"
    src="${htmlEscape(state.mediaSrc)}"
  ></audio>`;
}

function channelHtml(state) {
  if (!state.channelName) return '';

  return `<div class="player-channel">${htmlEscape(state.channelName)}</div>`;
}

export default function template(state) {
  return `<div class="player">
    ${mediaHtml(state)}
    <div class="player-seek">
      <button type="button" data-action="seek" data-seek="-30">-30s</button>
      <button type="button" data-action="seek" data-seek="-15">-15s</button>
      <button
        class="player-playpause"
        data-action="toggle-play"
        data-ref="playButton"
        type="button"
      >&#9654;</button>
      <button type="button" data-action="seek" data-seek="15">+15s</button>
      <button type="button" data-action="seek" data-seek="30">+30s</button>
    </div>
    <div class="player-title">
      ${channelHtml(state)}
      <div class="player-title-text">${htmlEscape(state.title)}</div>
    </div>
    <button class="player-back" data-action="back" type="button">
      &larr; ${htmlEscape(state.backLabel)}
    </button>
  </div>`;
}
