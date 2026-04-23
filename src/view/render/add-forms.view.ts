export interface AddFormsViewOptions {
  editLabel: string;
  addChannelLabel: string;
  addChannelPlaceholder: string;
  addChannelDisplayNamePlaceholder: string;
  addChannelTagsPlaceholder: string;
  addVideoLabel: string;
  addVideoPlaceholder: string;
}

export function renderAddFormsView(opts: AddFormsViewOptions): string {
  return `<label class="nav-edit">
  <input type="checkbox" id="sidebar-edit-toggle">
  <span>${opts.editLabel}</span>
</label>
<details class="add-channel">
  <summary>${opts.addChannelLabel}</summary>
  <div class="add-channel-panel">
    <form id="add-channel-form" class="add-channel-form">
      <input name="url" type="url" required placeholder="${opts.addChannelPlaceholder}">
      <input name="displayName" placeholder="${opts.addChannelDisplayNamePlaceholder}">
      <input name="tags" placeholder="${opts.addChannelTagsPlaceholder}">
      <button type="submit">${opts.addChannelLabel}</button>
    </form>
    <div id="add-channel-msg" class="add-channel-msg"></div>
  </div>
</details>
<details class="add-channel">
  <summary>${opts.addVideoLabel}</summary>
  <div class="add-channel-panel">
    <form id="add-video-form" class="add-channel-form">
      <input name="url" type="url" required placeholder="${opts.addVideoPlaceholder}">
      <button type="submit">${opts.addVideoLabel}</button>
    </form>
    <div id="add-video-msg" class="add-channel-msg"></div>
  </div>
</details>`;
}
