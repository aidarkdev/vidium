import { escape as htmlEscape } from '../../engine/core.js';

export function fieldClass(status) {
  return `add-channel-msg ${status || ''}`.trim();
}

function sidebarEditHtml(state) {
  return `<label class="nav-edit">
    <input type="checkbox" data-action="toggle-edit"${state.sidebarEdit ? ' checked' : ''}>
    <span>${htmlEscape(state.editLabel)}</span>
  </label>`;
}

function addChannelHtml(state) {
  return `<details class="add-channel" data-ref="channelDetails">
    <summary data-action="toggle-channel-details">${htmlEscape(state.addChannelLabel)}</summary>
    <div class="add-channel-panel">
      <form class="add-channel-form" data-action="add-channel">
        <input
          name="url"
          type="url"
          required
          placeholder="${htmlEscape(state.addChannelPlaceholder)}"
        >
        <input
          name="displayName"
          placeholder="${htmlEscape(state.addChannelDisplayNamePlaceholder)}"
        >
        <input
          name="tags"
          placeholder="${htmlEscape(state.addChannelTagsPlaceholder)}"
        >
        <button type="submit">${htmlEscape(state.addChannelLabel)}</button>
      </form>
      <div class="${fieldClass(state.channelMsgStatus)}" data-ref="channelMsg">
        ${htmlEscape(state.channelMsg)}
      </div>
    </div>
  </details>`;
}

function addVideoHtml(state) {
  return `<details class="add-channel" data-ref="videoDetails">
    <summary data-action="toggle-video-details">${htmlEscape(state.addVideoLabel)}</summary>
    <div class="add-channel-panel">
      <form class="add-channel-form" data-action="add-video">
        <input
          name="url"
          type="url"
          required
          placeholder="${htmlEscape(state.addVideoPlaceholder)}"
        >
        <button type="submit">${htmlEscape(state.addVideoLabel)}</button>
      </form>
      <div class="${fieldClass(state.videoMsgStatus)}" data-ref="videoMsg">
        ${htmlEscape(state.videoMsg)}
      </div>
    </div>
  </details>`;
}

export default function template(state) {
  const adminControls = state.isAdmin
    ? `<details class="nav-dropdown" data-ref="dropdown">
        <summary data-ref="summary" aria-expanded="false">
          ${htmlEscape(state.controlsLabel)}
        </summary>
        <div class="nav-dropdown-panel">
          <a href="/admin" class="nav-dropdown-link">${htmlEscape(state.manageLabel)}</a>
          ${sidebarEditHtml(state)}
          ${addChannelHtml(state)}
          ${addVideoHtml(state)}
        </div>
      </details>`
    : '';
  const authControls = state.isGuest
    ? `<a href="/login" class="nav-lang">${htmlEscape(state.loginLabel)}</a>
      <a href="/register" class="nav-lang">${htmlEscape(state.registerLabel)}</a>`
    : `<form method="post" action="/logout" data-action="logout">
      <button class="nav-logout" type="submit">${htmlEscape(state.logoutLabel)}</button>
    </form>`;

  return `<div class="nav-controls" data-ref="root">
    ${adminControls}
    <a href="${htmlEscape(state.langHref)}" class="nav-lang">
      ${htmlEscape(state.langLabel)}
    </a>
    ${authControls}
  </div>`;
}
