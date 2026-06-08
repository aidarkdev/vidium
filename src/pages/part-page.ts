/**
 * part-page.ts — server-side assembly for pages rendered by client parts.
 */

import { t } from './lang.ts';
import { assetUrl } from '../lib/assets.ts';

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
    import partModule from '${assetUrl(partPath)}';
    import { mount } from '${assetUrl('/engine/core.js')}';
    mount(partModule, ${safeJson({ id, microState: {}, ...params })});
  </script>`;
}

function navState(lang: string, isAdmin: boolean, isGuest: boolean): Record<string, unknown> {
  return {
    isAdmin,
    isGuest,
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
    eventChannelReset: 0,
    eventVideoReset: 0,
    langHref: `/lang/${lang === 'ru' ? 'en' : 'ru'}`,
    langLabel: lang === 'ru' ? 'EN' : 'RU',
    logoutLabel: t(lang, 'nav.logout'),
    loginLabel: t(lang, 'auth.login'),
    registerLabel: t(lang, 'auth.register'),
  };
}

interface PartPageOptions {
  lang: string;
  title: string;
  baked: Record<string, unknown>;
  body: string;
  isAdmin: boolean;
  mainClass?: string;
  bodyClass?: string;
  isGuest?: boolean;
}

export function renderPartPage(opts: PartPageOptions): string {
  const lang = escapeHtml(opts.lang);
  const mainClass = opts.mainClass ? `main ${escapeHtml(opts.mainClass)}` : 'main';
  const bodyClass = opts.bodyClass ? ` class="${escapeHtml(opts.bodyClass)}"` : '';
  const baked = {
    ...opts.baked,
    'nav-controls': navState(opts.lang, opts.isAdmin, opts.isGuest ?? false),
    'back-top': { visible: false, eventScrollTop: 0 },
  };
  /**
   * Shared MacroState contract:
   * - nav-controls owns nav-controls.sidebarEdit.
   * - back-top has no MacroState paths.
   */
  const navControls = mountScript('/parts/nav-controls/index.js', 'nav-controls', {
    expose: ['sidebarEdit'],
  });
  const backTop = mountScript('/parts/back-top/index.js', 'back-top');

  return `<!DOCTYPE html>
  <html lang="${lang}">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>paguo</title>
      <link rel="stylesheet" href="${assetUrl('/static/css/style.css')}">
      <link rel="icon" type="image/png" href="${assetUrl('/static/favicon.png')}">
      <link rel="manifest" href="/manifest.webmanifest">
      <meta name="theme-color" content="#111111">
      <meta name="mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-title" content="paguo">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <link rel="apple-touch-icon" href="${assetUrl('/static/icon-192.png')}">
      <script type="module" src="${assetUrl('/engine/core.js')}"></script>
      <script>
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js');
        }
      </script>
      <script type="application/json" id="__BAKED__">${safeJson(baked)}</script>
    </head>
    <body${bodyClass}>
      <nav class="nav">
        <div class="nav-inner">
          <a class="nav-logo" href="/">paguo</a>
          <div class="nav-links">
            ${navControls}
          </div>
        </div>
      </nav>
      <main class="${mainClass}">
        ${opts.body}
      </main>
      ${backTop}
    </body>
  </html>`;
}
