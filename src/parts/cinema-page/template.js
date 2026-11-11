import { escape as htmlEscape } from '../../engine/core.js';

export function item(video, state) {
  return `<article class="cinema-item">
    <h2>${htmlEscape(video.title)}</h2>
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
  return `<section class="cinema-page">
    <h1>${htmlEscape(state.labels.title)}</h1>
    ${
      state.isAdmin
        ? `<form data-action="create" class="add-channel-form">
      <label>${htmlEscape(state.labels.name)} <input name="title" required maxlength="300"></label>
      <button type="submit">${htmlEscape(state.labels.add)}</button>
    </form>`
        : ''
    }
    <p role="alert" data-ref="error">${htmlEscape(state.error)}</p>
    <div>${state.items.length ? state.items.map((video) => item(video, state)).join('') : `<p>${htmlEscape(state.labels.empty)}</p>`}</div>
    <nav class="cinema-pagination" aria-label="${htmlEscape(state.labels.title)}">
      ${state.page > 1 ? `<a href="/cinema?page=${state.page - 1}">${htmlEscape(state.labels.previous)}</a>` : ''}
      <span>${state.page} / ${state.pageCount}</span>
      ${state.page < state.pageCount ? `<a href="/cinema?page=${state.page + 1}">${htmlEscape(state.labels.next)}</a>` : ''}
    </nav>
  </section>`;
}
