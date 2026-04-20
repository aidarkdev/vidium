/**
 * page.ts — shared HTML layout: doctype, head, nav, and page shell.
 */

import { esc } from './esc.ts';
import { t } from './lang.ts';

export interface PageOptions {
  title: string;
  lang: string;
  body: string;
  head?: string;
  navExtra?: string; // HTML injected into nav-links
  scripts?: string[]; // JS files injected before </body>
}

export function page(opts: PageOptions): string {
  const scripts = (opts.scripts ?? [])
    .map((src) => `<script src="${esc(src)}"></script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${esc(opts.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<link rel="stylesheet" href="/static/css/style.css">
${opts.head ?? ''}
</head>
<body>
<nav class="nav">
  <a class="nav-logo" href="/">vidium</a>
  <div class="nav-links">
    ${opts.navExtra ?? ''}
    <a href="/lang/${opts.lang === 'ru' ? 'en' : 'ru'}" class="nav-lang">${opts.lang === 'ru' ? 'EN' : 'RU'}</a>
    <form method="post" action="/logout">
      <button type="submit">${t(opts.lang, 'nav.logout')}</button>
    </form>
  </div>
</nav>
<main class="main">
${opts.body}
</main>
${scripts}
</body>
</html>`;
}
