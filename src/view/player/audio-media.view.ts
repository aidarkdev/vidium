export function renderAudioMedia(thumbSrc: string, altText: string, mediaSrc: string): string {
  return `<img class="player-thumb" src="${thumbSrc}" alt="${altText}">
    <audio id="audio-player" controls autoplay preload="metadata" src="${mediaSrc}">Your browser does not support the audio element.</audio>
    <div class="audio-seek">
      <button type="button" data-seek="-30">−30s</button>
      <button type="button" data-seek="-15">−15s</button>
      <button id="audio-playpause" class="audio-playpause" type="button" data-action="toggle-play">&#9654;</button>
      <button type="button" data-seek="15">+15s</button>
      <button type="button" data-seek="30">+30s</button>
    </div>
    <script src="/static/js/audio-player.js"></script>`;
}
