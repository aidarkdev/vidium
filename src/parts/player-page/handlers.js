function activeChapterStart(chapters, currentTime) {
  if (!Array.isArray(chapters) || chapters.length === 0) return -1;

  const time = Number(currentTime);
  if (!Number.isFinite(time) || time < 0) return -1;

  let activeStart = -1;
  for (const chapter of chapters) {
    if (time >= chapter.start && time < chapter.end) return chapter.start;
    if (time >= chapter.start) activeStart = chapter.start;
  }
  return activeStart;
}

function syncActiveChapter(part) {
  part.set('activeChapterStart', activeChapterStart(part.state.chapters, part.refs.media.currentTime));
}

export default {
  events: {
    'click [data-action="back"]': (part) => part.set('eventBack', part.state.eventBack + 1),
    'click [data-action="seek"]': (part, event) => {
      const delta = Number(event.target.closest('[data-seek]').dataset.seek || 0);
      part.set({
        seekDelta: delta,
        eventSeek: part.state.eventSeek + 1,
      });
    },
    'click [data-action="chapter-seek"]': (part, event) => {
      const start = Number(event.target.closest('[data-chapter-start]').dataset.chapterStart || 0);
      if (!Number.isFinite(start) || start < 0) return;
      part.set({
        chapterSeekTime: start,
        eventChapterSeek: part.state.eventChapterSeek + 1,
      });
    },
    'click [data-action="toggle-play"]': (part) =>
      part.set('eventPlay', part.state.eventPlay + 1),
    'click [data-action="toggle-rate"]': (part) =>
      part.set('playbackRate', part.state.playbackRate === 1 ? 1.25 : 1),
  },
  state: {
    eventBack: () => {
      if (history.length > 1) history.back();
      else location.href = '/feed';
    },
    eventSeek: (part) => {
      part.refs.media.currentTime = Math.max(
        0,
        part.refs.media.currentTime + part.state.seekDelta,
      );
    },
    eventChapterSeek: (part) => {
      part.refs.media.currentTime = Math.max(0, part.state.chapterSeekTime);
      part.refs.media.play().catch(() => {});
    },
    eventPlay: (part) => {
      if (part.refs.media.paused) part.refs.media.play();
      else part.refs.media.pause();
    },
    paused: (part, value) => {
      part.refs.playButton.classList.toggle('is-paused', value);
    },
    playbackRate: (part, value) => {
      part.refs.media.playbackRate = value;
      part.refs.rateButton.textContent = value === 1 ? '1.25x' : '1x';
    },
    activeChapterStart: (part, value) => {
      for (const btn of part.root.querySelectorAll('[data-action="chapter-seek"]')) {
        btn.classList.toggle('is-active', Number(btn.dataset.chapterStart) === value);
      }
    },
  },
  onMount: (part) => {
    part.private.sync = () => part.set('paused', part.refs.media.paused);
    part.refs.media.addEventListener('play', part.private.sync);
    part.refs.media.addEventListener('pause', part.private.sync);
    part.private.sync();
    part.refs.media.playbackRate = part.state.playbackRate;
    syncActiveChapter(part);
    part.private.chapterTimer = setInterval(() => syncActiveChapter(part), 5000);
  },
  onDestroy: (part) => {
    part.refs.media.removeEventListener('play', part.private.sync);
    part.refs.media.removeEventListener('pause', part.private.sync);
    clearInterval(part.private.chapterTimer);
  },
};
