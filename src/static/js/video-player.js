function seek(secondsDelta) {
  var videoPlayer = document.getElementById('video-player');
  videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime + secondsDelta);
}

function togglePlay() {
  var videoPlayer = document.getElementById('video-player');
  if (videoPlayer.paused) videoPlayer.play();
  else videoPlayer.pause();
}

(() => {
  var videoPlayer = document.getElementById('video-player');
  var playPauseButton = document.getElementById('audio-playpause');
  var seekButtons = document.querySelectorAll('[data-seek]');
  var togglePlayButton = document.querySelector('[data-action="toggle-play"]');

  seekButtons.forEach((button) => {
    button.addEventListener('click', () => {
      seek(Number(button.getAttribute('data-seek') ?? '0'));
    });
  });

  if (togglePlayButton) {
    togglePlayButton.addEventListener('click', togglePlay);
  }

  function sync() {
    playPauseButton.innerHTML = videoPlayer.paused ? '&#9654;' : '&#9646;&#9646;';
  }

  videoPlayer.addEventListener('play', sync);
  videoPlayer.addEventListener('pause', sync);
  sync();
})();
