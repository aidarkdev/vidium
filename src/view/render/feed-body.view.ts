export function renderFeedBodyView(topbar: string, sidebar: string): string {
  return `${topbar}
  ${sidebar}
  <div class="cards" id="cards"></div>
  <button class="btn-more" id="btn-more" style="display:none">Load more</button>`;
}
