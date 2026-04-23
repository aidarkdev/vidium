/**
 * page.ts — shared HTML layout: doctype, head, nav, and page shell.
 */

import { esc } from './esc.ts';
import { t } from './lang.ts';
import { renderPageHtml } from './page/page-html.view.ts';

export interface PageOptions {
  title: string;
  lang: string;
  body: string;
  head?: string;
  navExtra?: string; // HTML injected into nav-links
  scripts?: string[]; // JS files injected before </body>
}

export function page(opts: PageOptions): string {
  const title = esc(opts.title);
  const lang = esc(opts.lang);
  const head = opts.head ?? '';
  const navExtra = opts.navExtra ?? '';
  const langHref = `/lang/${opts.lang === 'ru' ? 'en' : 'ru'}`;
  const langLabel = opts.lang === 'ru' ? 'EN' : 'RU';
  const logoutLabel = t(opts.lang, 'nav.logout');
  const scripts = (opts.scripts ?? [])
    .map((src) => `<script src="${esc(src)}"></script>`)
    .join('\n');

  return renderPageHtml({
    title,
    lang,
    head,
    navExtra,
    langHref,
    langLabel,
    logoutLabel,
    scripts,
    body: opts.body,
  });
}
