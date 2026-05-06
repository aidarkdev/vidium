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
    'click [data-action="toggle-play"]': (part) =>
      part.set('eventPlay', part.state.eventPlay + 1),
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
    eventPlay: (part) => {
      if (part.refs.media.paused) part.refs.media.play();
      else part.refs.media.pause();
    },
    paused: (part, value) => {
      part.refs.playButton.innerHTML = value ? '&#9654;' : '&#9646;&#9646;';
    },
  },
  onMount: (part) => {
    part.private.sync = () => part.set('paused', part.refs.media.paused);
    part.refs.media.addEventListener('play', part.private.sync);
    part.refs.media.addEventListener('pause', part.private.sync);
    part.private.sync();
  },
  onDestroy: (part) => {
    part.refs.media.removeEventListener('play', part.private.sync);
    part.refs.media.removeEventListener('pause', part.private.sync);
  },
};
