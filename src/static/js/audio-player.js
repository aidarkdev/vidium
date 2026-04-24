function seek(secondsDelta) {
  var audioPlayer = document.getElementById('audio-player');
  audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime + secondsDelta);
}

function togglePlay() {
  var audioPlayer = document.getElementById('audio-player');
  if (audioPlayer.paused) audioPlayer.play();
  else audioPlayer.pause();
}

(() => {
  var audioPlayer = document.getElementById('audio-player');
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
    playPauseButton.innerHTML = audioPlayer.paused ? '&#9654;' : '&#9646;&#9646;';
  }

  audioPlayer.addEventListener('play', sync);
  audioPlayer.addEventListener('pause', sync);
  sync();
})();
