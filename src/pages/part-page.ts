/**
 * part-page.ts — server-side assembly for pages rendered by client parts.
 */

import { t } from './lang.ts';

function safeJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function mountScript(
  partPath: string,
  id: string,
  params: Record<string, unknown> = {},
): string {
  return `
  <script mount-dot="mount-dot-${id}" type="module">
    import partModule from '${partPath}';
    import { mount } from '/engine/core.js';
    mount(partModule, ${safeJson({ id, microState: {}, ...params })});
  </script>`;
}

function navState(lang: string): Record<string, unknown> {
  return {
    controlsLabel: t(lang, 'nav.controls'),
    manageLabel: t(lang, 'nav.manage'),
    editLabel: t(lang, 'sidebar.edit'),
    addChannelLabel: t(lang, 'channel.add'),
    addChannelPlaceholder: t(lang, 'channel.add.placeholder'),
    addChannelDisplayNamePlaceholder: t(lang, 'channel.add.display_name_placeholder'),
    addChannelTagsPlaceholder: t(lang, 'channel.add.tags_placeholder'),
    addVideoLabel: t(lang, 'video.add'),
    addVideoPlaceholder: t(lang, 'video.add.placeholder'),
    channelAdded: t(lang, 'channel.added'),
    channelExists: t(lang, 'channel.exists'),
    channelError: t(lang, 'channel.error'),
    videoAdded: t(lang, 'video.added'),
    videoExists: t(lang, 'video.exists'),
    videoError: t(lang, 'video.error'),
    channelMsg: '',
    channelMsgStatus: '',
    videoMsg: '',
    videoMsgStatus: '',
    channelDetailsOpen: false,
    videoDetailsOpen: false,
    sidebarEdit: false,
    dropdownOpen: false,
    channelResetRequested: 0,
    videoResetRequested: 0,
    langHref: `/lang/${lang === 'ru' ? 'en' : 'ru'}`,
    langLabel: lang === 'ru' ? 'EN' : 'RU',
    logoutLabel: t(lang, 'nav.logout'),
  };
}

interface PartPageOptions {
  lang: string;
  title: string;
  baked: Record<string, unknown>;
  body: string;
}

export function renderPartPage(opts: PartPageOptions): string {
  const title = escapeHtml(opts.title);
  const lang = escapeHtml(opts.lang);
  const baked = {
    ...opts.baked,
    'nav-controls': navState(opts.lang),
    'back-top': { visible: false, scrollTopRequested: 0 },
  };
  const navControls = mountScript('/parts/nav-controls/index.js', 'nav-controls');
  const backTop = mountScript('/parts/back-top/index.js', 'back-top');

  return `<!DOCTYPE html>
  <html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/static/css/style.css">
    <link rel="icon" type="image/png" href="/static/favicon.png">
    <script type="module" src="/engine/core.js"></script>
    <script type="application/json" id="__BAKED__">${safeJson(baked)}</script>
  </head>
  <body>
    <nav class="nav">
      <a class="nav-logo" href="/">vidium</a>
      <div class="nav-links">
        ${navControls}
      </div>
    </nav>
    <main class="main">
      ${opts.body}
    </main>
    ${backTop}
  </body>
  </html>`;
}
