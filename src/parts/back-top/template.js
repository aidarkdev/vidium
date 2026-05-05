export default function template(state) {
  return `<button
    class="btn-top${state.visible ? ' visible' : ''}"
    data-ref="button"
    data-action="top"
  >&#8679;</button>`;
}
