export interface SidebarChannelItemViewOptions {
  id: number;
  label: string;
  active: boolean;
  moveUpLabel: string;
  moveDownLabel: string;
}

export function renderSidebarChannelItemView(opts: SidebarChannelItemViewOptions): string {
  return `<div class="sidebar-channel-row" data-channel-id="${opts.id}">
    <a class="sidebar-channel-link${opts.active ? ' active' : ''}" href="/channel/${opts.id}">${opts.label}</a>
    <div class="sidebar-channel-actions">
      <button
        class="sidebar-order-btn"
        type="button"
        data-action="move-channel"
        data-direction="up"
        data-channel-id="${opts.id}"
        aria-label="${opts.moveUpLabel}"
        title="${opts.moveUpLabel}"
      >&#8593;</button>
      <button
        class="sidebar-order-btn"
        type="button"
        data-action="move-channel"
        data-direction="down"
        data-channel-id="${opts.id}"
        aria-label="${opts.moveDownLabel}"
        title="${opts.moveDownLabel}"
      >&#8595;</button>
    </div>
  </div>`;
}
