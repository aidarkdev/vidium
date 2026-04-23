export function renderTopbarView(label: string): string {
  return `<div class="topbar">
  <button class="sidebar-toggle" id="sidebar-toggle">&#9776;</button>
  <span class="topbar-label">${label}</span>
</div>`;
}
