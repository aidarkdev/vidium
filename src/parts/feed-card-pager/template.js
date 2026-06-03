import { escape as htmlEscape } from '../../engine/core.js';
import { cardHtml } from '../feed-page/template.js';

export function cardsHtml(state) {
  const options = { allowDownload: state.allowDownload !== false };
  return state.cards.map((card) => cardHtml(card, state.strings, options)).join('');
}

function statusHtml(state) {
  const first = state.total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const last = Math.min(state.total, state.page * state.pageSize);
  return htmlEscape(
    state.strings.pageStatus
      .replace('{first}', String(first))
      .replace('{last}', String(last))
      .replace('{total}', String(state.total)),
  );
}

function pageButton(page, state) {
  return `<button
    type="button"
    class="feed-pager-page${page === state.page ? ' active' : ''}"
    data-action="page"
    data-page="${page}"
    ${page === state.page || state.loading ? 'disabled' : ''}
  >${page}</button>`;
}

function pageNumbers(state) {
  const start = Math.max(1, state.page - 2);
  const end = Math.min(state.pageCount, start + 4);
  const pages = [];
  for (let page = Math.max(1, end - 4); page <= end; page += 1) {
    pages.push(pageButton(page, state));
  }
  return pages.join('');
}

export function pagerHtml(state) {
  const prevPage = Math.max(1, state.page - 1);
  const nextPage = Math.min(state.pageCount, state.page + 1);

  return `<nav class="feed-pager-controls" data-ref="pager" aria-label="${htmlEscape(state.strings.pagination)}">
    <div class="feed-pager-status" data-ref="status">${statusHtml(state)}</div>
    <div class="feed-pager-buttons">
      <button
        type="button"
        class="feed-pager-nav"
        data-action="page"
        data-page="${prevPage}"
        aria-label="${htmlEscape(state.strings.previous)}"
        title="${htmlEscape(state.strings.previous)}"
        ${state.page <= 1 || state.loading ? 'disabled' : ''}
      >&lt;</button>
      ${pageNumbers(state)}
      <button
        type="button"
        class="feed-pager-nav"
        data-action="page"
        data-page="${nextPage}"
        aria-label="${htmlEscape(state.strings.next)}"
        title="${htmlEscape(state.strings.next)}"
        ${state.page >= state.pageCount || state.loading ? 'disabled' : ''}
      >&gt;</button>
    </div>
    <div class="feed-pager-message" data-ref="message">${htmlEscape(state.error || '')}</div>
  </nav>`;
}

export default function template(state) {
  return `<section class="feed-card-pager">
    ${pagerHtml(state)}
    <div class="cards" data-ref="cards">${cardsHtml(state)}</div>
  </section>`;
}
