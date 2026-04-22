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

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/static/css/style.css">
${head}
</head>
<body>
<nav class="nav">
  <a class="nav-logo" href="/">vidium</a>
  <div class="nav-links">
    ${navExtra}
    <a href="${langHref}" class="nav-lang">${langLabel}</a>
    <form method="post" action="/logout">
      <button type="submit">${logoutLabel}</button>
    </form>
  </div>
</nav>
<main class="main">
${opts.body}
</main>
<button class="btn-top" id="btn-top" onclick="window.scrollTo({top:0,behavior:'smooth'})">&#8679;</button>
<script>(()=>{const b=document.getElementById('btn-top');window.addEventListener('scroll',()=>b.classList.toggle('visible',window.scrollY>300),{passive:true});})();</script>
${scripts}
</body>
</html>`;
}
