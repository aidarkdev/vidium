import { escape as htmlEscape } from '../../engine/core.js';

function fieldHtml(field) {
  const autocomplete = field.autocomplete
    ? ` autocomplete="${htmlEscape(field.autocomplete)}"`
    : '';

  return `<label>
    ${htmlEscape(field.label)}
    <input
      type="${htmlEscape(field.type)}"
      name="${htmlEscape(field.name)}"
      ${autocomplete}
      required
    >
  </label>`;
}

export default function template(state) {
  const errorHtml = state.error ? `<p class="error">${htmlEscape(state.error)}</p>` : '';
  const fieldsHtml = state.fields.map(fieldHtml).join('');

  return `<div class="auth-form">
    <h1>${htmlEscape(state.heading)}</h1>
    ${errorHtml}
    <form method="post" action="${htmlEscape(state.action)}">
      ${fieldsHtml}
      <button type="submit">${htmlEscape(state.submitLabel)}</button>
    </form>
    <p class="link">
      <a href="${htmlEscape(state.linkHref)}">${htmlEscape(state.linkLabel)}</a>
    </p>
  </div>`;
}
