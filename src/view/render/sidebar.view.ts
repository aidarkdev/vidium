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

import { renderSidebarChannelItemView } from './sidebar-channel-item.view.ts';

export function renderSidebarView(opts: SidebarViewOptions): string {
  const channelLinks = opts.channels.map(renderSidebarChannelItemView).join('\n');

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
