export function renderVideoMedia(mediaSrc: string): string {
  return `<video id="video-player" controls autoplay preload="metadata" src="${mediaSrc}">Your browser does not support the video element.</video>
    <div class="audio-seek">
      <button type="button" data-seek="-30">−30s</button>
      <button type="button" data-seek="-15">−15s</button>
      <button id="audio-playpause" class="audio-playpause" type="button" data-action="toggle-play">&#9654;</button>
      <button type="button" data-seek="15">+15s</button>
      <button type="button" data-seek="30">+30s</button>
    </div>
    <script src="/static/js/video-player.js"></script>`;
}
