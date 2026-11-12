import { escape as htmlEscape } from '../../engine/core.js';

export function item(video, state) {
  return `<article class="cinema-item">
    <h3>${htmlEscape(video.title)}</h3>
    ${video.ready ? `<a href="/cinema/v/${htmlEscape(video.uid)}">${htmlEscape(state.labels.watch)}</a>` : `<p>${htmlEscape(state.labels.waiting)}</p>`}
    ${
      state.isAdmin
        ? `<details><summary>UID: ${htmlEscape(video.uid)}</summary>
      <p><code>${htmlEscape(video.expectedPath)}</code></p>
      <p>${htmlEscape(state.labels.instructions)}</p>
      <pre><code>${htmlEscape(video.commands)}</code></pre>
    </details><button type="button" data-action="delete" data-uid="${htmlEscape(video.uid)}">${htmlEscape(state.labels.delete)}</button>`
        : ''
    }
  </article>`;
}

export default function template(state) {
  const error = `<p class="cinema-error" role="alert" data-ref="error" ${state.error ? '' : 'hidden'}>${htmlEscape(state.error)}</p>`;
  return `<section class="cinema-page">
    <h1>${htmlEscape(state.labels.title)}</h1>
    ${
      state.isAdmin
        ? `<section class="cinema-create">
      <h2>${htmlEscape(state.labels.create)}</h2>
      <p class="cinema-create-hint">${htmlEscape(state.labels.create_hint)}</p>
      <form data-action="create" class="cinema-create-form">
        <label>
          <span>${htmlEscape(state.labels.name)}</span>
          <input name="title" required maxlength="300">
        </label>
        <button type="submit">${htmlEscape(state.labels.add)}</button>
      </form>
      ${error}
    </section>`
        : error
    }
    <section class="cinema-library">
    <h2>${htmlEscape(state.labels.library)}</h2>
    <div>${state.items.length ? state.items.map((video) => item(video, state)).join('') : `<p>${htmlEscape(state.labels.empty)}</p>`}</div>
    <nav class="cinema-pagination" aria-label="${htmlEscape(state.labels.title)}">
      ${state.page > 1 ? `<a href="/cinema?page=${state.page - 1}">${htmlEscape(state.labels.previous)}</a>` : ''}
      <span>${state.page} / ${state.pageCount}</span>
      ${state.page < state.pageCount ? `<a href="/cinema?page=${state.page + 1}">${htmlEscape(state.labels.next)}</a>` : ''}
    </nav>
    </section>
  </section>`;
}
