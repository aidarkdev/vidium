export interface SidebarChannelItem {
  id: number;
  label: string;
  active: boolean;
  moveUpLabel: string;
  moveDownLabel: string;
}

export interface SidebarViewOptions {
  allLabel: string;
  readyLabel: string;
  manualLabel: string;
  allActive: boolean;
  readyActive: boolean;
  manualActive: boolean;
  channels: SidebarChannelItem[];
}

export function renderSidebarView(opts: SidebarViewOptions): string {
  const channelLinks = opts.channels
    .map(
      (ch) => `<div class="sidebar-channel-row" data-channel-id="${ch.id}">
  <a class="sidebar-channel-link${ch.active ? ' active' : ''}" href="/channel/${ch.id}">${ch.label}</a>
  <div class="sidebar-channel-actions">
    <button
      class="sidebar-order-btn"
      type="button"
      data-action="move-channel"
      data-direction="up"
      data-channel-id="${ch.id}"
      aria-label="${ch.moveUpLabel}"
      title="${ch.moveUpLabel}"
    >&#8593;</button>
    <button
      class="sidebar-order-btn"
      type="button"
      data-action="move-channel"
      data-direction="down"
      data-channel-id="${ch.id}"
      aria-label="${ch.moveDownLabel}"
      title="${ch.moveDownLabel}"
    >&#8595;</button>
  </div>
</div>`,
    )
    .join('\n');

  return `<div class="sidebar-panel" id="sidebar-panel">
  <div class="sidebar-system">
    <a href="/feed"${opts.allActive ? ' class="active"' : ''}>${opts.allLabel}</a>
    <a href="/feed/ready"${opts.readyActive ? ' class="active"' : ''}>${opts.readyLabel}</a>
    <a href="/feed/manual"${opts.manualActive ? ' class="active"' : ''}>${opts.manualLabel}</a>
  </div>
  <div class="sidebar-divider"></div>
  <div class="sidebar-channels">${channelLinks}</div>
</div>`;
}
