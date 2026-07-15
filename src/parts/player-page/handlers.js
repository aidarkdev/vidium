import { formatCountdown } from './template.js';

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

const RESUME_MIN_SECONDS = 5;
const RESUME_END_MARGIN_SECONDS = 10;
const RESUME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function readResumeTime(part) {
  try {
    const raw = localStorage.getItem(part.state.resumeKey);
    if (!raw) return 0;

    const data = JSON.parse(raw);
    const time = Number(data?.time);
    const updatedAt = Number(data?.updatedAt);
    if (!Number.isFinite(time) || time <= RESUME_MIN_SECONDS) return 0;
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > RESUME_MAX_AGE_MS) {
      localStorage.removeItem(part.state.resumeKey);
      return 0;
    }
    return time;
  } catch {
    return 0;
  }
}

function shouldSavePosition(media) {
  const time = Number(media.currentTime);
  if (!Number.isFinite(time) || time <= RESUME_MIN_SECONDS) return false;
  if (Number.isFinite(media.duration) && media.duration - time <= RESUME_END_MARGIN_SECONDS) {
    return false;
  }
  return true;
}

function saveResumeTime(part) {
  try {
    if (!shouldSavePosition(part.refs.media)) return;
    localStorage.setItem(
      part.state.resumeKey,
      JSON.stringify({ time: part.refs.media.currentTime, updatedAt: Date.now() }),
    );
  } catch {}
}

function clearResumeTime(part) {
  try {
    localStorage.removeItem(part.state.resumeKey);
  } catch {}
}

function restoreResumeTime(part) {
  const time = readResumeTime(part);
  const duration = part.refs.media.duration;
  if (Number.isFinite(duration) && duration - time <= RESUME_END_MARGIN_SECONDS) {
    clearResumeTime(part);
    return;
  }
  if (time > RESUME_MIN_SECONDS) {
    part.set({
      resumeTime: time,
      eventResume: part.state.eventResume + 1,
    });
  }
}

function syncPlayerProgress(part) {
  syncActiveChapter(part);
  saveResumeTime(part);
}

function recordFirstPlay(part) {
  if (part.private.playRecorded) return;
  part.private.playRecorded = true;
  fetch('/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: part.state.uid, kind: part.state.kind }),
  }).catch(() => {});
}

function syncSleepTimer(part) {
  if (!part.state.sleepDeadline) return;
  const remaining = Math.max(0, Math.ceil((part.state.sleepDeadline - Date.now()) / 1000));
  part.set('sleepRemainingSeconds', remaining);
  if (remaining === 0) part.set('sleepDeadline', 0);
}

function sleepAvailable(part, mediaDuration) {
  const duration = Number(mediaDuration);
  const sleepDuration = Number(part.state.sleepDurationSeconds);
  return Number.isFinite(duration) && Number.isFinite(sleepDuration) && duration >= sleepDuration;
}

function setupMediaSession(part) {
  if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
  if (!('mediaSession' in navigator)) return;

  try {
    if ('MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: part.state.title,
        artist: part.state.channelName,
        artwork: [{ src: part.state.thumbSrc }],
      });
    }
    navigator.mediaSession.playbackState = part.refs.media.paused ? 'paused' : 'playing';
  } catch {
    // The native media element remains the playback fallback.
  }
}

function clearMediaSession() {
  if ('audioSession' in navigator) navigator.audioSession.type = 'auto';
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
  }
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
    'click [data-action="share"]': async (part) => {
      if (typeof navigator.share === 'function') {
        part.set('shareStatus', 'sharing');
        try {
          await navigator.share({ title: part.state.title, url: location.href });
        } catch {
          // Closing the native share menu is not an error that needs UI feedback.
        }
        if (!part.private.destroyed) part.set('shareStatus', 'idle');
        return;
      }

      part.set('shareStatus', 'copying');
      try {
        await navigator.clipboard.writeText(location.href);
        if (part.private.destroyed) return;
        part.set('shareStatus', 'copied');
      } catch {
        if (part.private.destroyed) return;
        part.set('shareStatus', 'idle');
        return;
      }
      clearTimeout(part.private.shareStatusTimer);
      part.private.shareStatusTimer = setTimeout(() => part.set('shareStatus', 'idle'), 500);
    },
    'click [data-action="sleep"]': (part) => {
      if (part.state.sleepDeadline) {
        part.set({
          sleepDeadline: 0,
          sleepRemainingSeconds: part.state.sleepDurationSeconds,
        });
        return;
      }

      part.set({
        sleepDeadline: Date.now() + part.state.sleepDurationSeconds * 1000,
        sleepRemainingSeconds: part.state.sleepDurationSeconds,
      });
    },
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
      syncPlayerProgress(part);
    },
    eventChapterSeek: (part) => {
      part.refs.media.currentTime = Math.max(0, part.state.chapterSeekTime);
      syncPlayerProgress(part);
      part.refs.media.play().catch(() => {});
    },
    eventResume: (part) => {
      part.refs.media.currentTime = Math.max(0, part.state.resumeTime);
      syncActiveChapter(part);
    },
    eventPlay: (part) => {
      if (part.refs.media.paused) part.refs.media.play();
      else part.refs.media.pause();
    },
    paused: (part, value) => {
      part.refs.playButton.classList.toggle('is-paused', value);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = value ? 'paused' : 'playing';
      }
    },
    playbackRate: (part, value) => {
      part.refs.media.playbackRate = value;
      part.refs.rateButton.classList.toggle('is-active', value === 1.25);
    },
    activeChapterStart: (part, value) => {
      for (const btn of part.root.querySelectorAll('[data-action="chapter-seek"]')) {
        btn.classList.toggle('is-active', Number(btn.dataset.chapterStart) === value);
      }
    },
    shareStatus: (part, value) => {
      if (!part.refs.shareButton) return;
      part.refs.shareButton.disabled = value === 'sharing' || value === 'copying';
      part.refs.shareButton.classList.toggle('is-success', value === 'copied');
    },
    sleepRemainingSeconds: (part, value, oldValue) => {
      part.refs.sleepCountdown.textContent = formatCountdown(value);
      if (value === 0 && oldValue > 0) part.refs.media.pause();
    },
    sleepDeadline: (part, value) => {
      part.refs.sleepButton.classList.toggle('is-active', value > 0);
    },
    mediaDurationSeconds: (part, value) => {
      const available = sleepAvailable(part, value);
      part.refs.sleepControls.hidden = !available;
      if (!available && part.state.sleepDeadline) {
        part.set({
          sleepDeadline: 0,
          sleepRemainingSeconds: part.state.sleepDurationSeconds,
        });
      }
    },
  },
  onMount: (part) => {
    part.private.sync = () => part.set('paused', part.refs.media.paused);
    part.private.restore = () => {
      part.set('mediaDurationSeconds', part.refs.media.duration);
      restoreResumeTime(part);
    };
    part.private.clearResume = () => clearResumeTime(part);
    part.private.recordFirstPlay = () => recordFirstPlay(part);
    part.refs.media.addEventListener('play', part.private.sync);
    part.refs.media.addEventListener('play', part.private.recordFirstPlay);
    part.refs.media.addEventListener('pause', part.private.sync);
    part.refs.media.addEventListener('loadedmetadata', part.private.restore, { once: true });
    part.refs.media.addEventListener('ended', part.private.clearResume);
    part.private.sync();
    part.refs.media.playbackRate = part.state.playbackRate;
    setupMediaSession(part);
    syncPlayerProgress(part);
    part.private.chapterTimer = setInterval(() => syncPlayerProgress(part), 5000);
    part.private.sleepTimer = setInterval(() => syncSleepTimer(part), 1000);
  },
  onDestroy: (part) => {
    part.private.destroyed = true;
    part.refs.media.removeEventListener('play', part.private.sync);
    part.refs.media.removeEventListener('play', part.private.recordFirstPlay);
    part.refs.media.removeEventListener('pause', part.private.sync);
    part.refs.media.removeEventListener('loadedmetadata', part.private.restore);
    part.refs.media.removeEventListener('ended', part.private.clearResume);
    clearInterval(part.private.chapterTimer);
    clearInterval(part.private.sleepTimer);
    clearTimeout(part.private.shareStatusTimer);
    clearMediaSession();
  },
};
