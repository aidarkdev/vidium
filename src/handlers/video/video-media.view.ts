export function renderVideoMedia(mediaSrc: string): string {
  return `<video id="video-player" controls autoplay preload="metadata" src="${mediaSrc}">Your browser does not support the video element.</video>
<div class="audio-seek">
  <button onclick="seek(-30)">−30s</button>
  <button onclick="seek(-15)">−15s</button>
  <button id="audio-playpause" class="audio-playpause" onclick="togglePlay()">&#9654;</button>
  <button onclick="seek(15)">+15s</button>
  <button onclick="seek(30)">+30s</button>
</div>
<script>
function seek(s){var a=document.getElementById('video-player');a.currentTime=Math.max(0,a.currentTime+s);}
function togglePlay(){var a=document.getElementById('video-player');if(a.paused)a.play();else a.pause();}
(function(){var a=document.getElementById('video-player');var b=document.getElementById('audio-playpause');function sync(){b.innerHTML=a.paused?'&#9654;':'&#9646;&#9646;';}a.addEventListener('play',sync);a.addEventListener('pause',sync);sync();})();
</script>`;
}
