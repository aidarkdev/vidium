export default {
  events: {
    'click [data-action="top"]': (part) =>
      part.set('eventScrollTop', part.state.eventScrollTop + 1),
  },
  state: {
    visible: (part, value) => part.refs.button.classList.toggle('visible', value),
    eventScrollTop: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  },
  onMount: (part) => {
    part.private.onScroll = () => part.set('visible', window.scrollY > 300);
    window.addEventListener('scroll', part.private.onScroll, { passive: true });
    part.private.onScroll();
  },
  onDestroy: (part) => window.removeEventListener('scroll', part.private.onScroll),
};
