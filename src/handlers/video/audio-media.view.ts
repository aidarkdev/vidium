export function renderAudioMedia(
  thumbSrc: string,
  altText: string,
  mediaSrc: string,
): string {
  return `<img class="player-thumb" src="${thumbSrc}" alt="${altText}">
<audio id="audio-player" controls autoplay preload="metadata" src="${mediaSrc}">Your browser does not support the audio element.</audio>
<div class="audio-seek">
  <button onclick="seek(-30)">−30s</button>
  <button onclick="seek(-15)">−15s</button>
  <button id="audio-playpause" class="audio-playpause" onclick="togglePlay()">&#9654;</button>
  <button onclick="seek(15)">+15s</button>
  <button onclick="seek(30)">+30s</button>
</div>
<script>
function seek(s){var a=document.getElementById('audio-player');a.currentTime=Math.max(0,a.currentTime+s);}
function togglePlay(){var a=document.getElementById('audio-player');if(a.paused)a.play();else a.pause();}
(function(){var a=document.getElementById('audio-player');var b=document.getElementById('audio-playpause');function sync(){b.innerHTML=a.paused?'&#9654;':'&#9646;&#9646;';}a.addEventListener('play',sync);a.addEventListener('pause',sync);sync();})();
</script>`;
}
