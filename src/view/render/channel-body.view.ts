export function renderChannelBodyView(topbar: string, sidebar: string, loadMore: string): string {
  return `${topbar}
  ${sidebar}
  <div class="cards" id="cards"></div>
  ${loadMore}`;
}
