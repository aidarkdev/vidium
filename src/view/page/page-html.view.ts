export interface PageHtmlOptions {
  title: string;
  lang: string;
  head: string;
  navExtra: string;
  langHref: string;
  langLabel: string;
  logoutLabel: string;
  scripts: string;
  body: string;
}

export function renderPageHtml(opts: PageHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="${opts.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${opts.title}</title>
  <link rel="stylesheet" href="/static/css/style.css">
  <link rel="icon" type="image/png" href="/static/favicon.png">
  ${opts.head}
</head>
<body>
  <nav class="nav">
    <a class="nav-logo" href="/">vidium</a>
    <div class="nav-links">
      ${opts.navExtra}
      <a href="${opts.langHref}" class="nav-lang">${opts.langLabel}</a>
      <form method="post" action="/logout">
        <button type="submit">${opts.logoutLabel}</button>
      </form>
    </div>
  </nav>
  <main class="main">
    ${opts.body}
  </main>
  <button class="btn-top" id="btn-top" onclick="window.scrollTo({top:0,behavior:'smooth'})">&#8679;</button>
  <script>(()=>{const b=document.getElementById('btn-top');window.addEventListener('scroll',()=>b.classList.toggle('visible',window.scrollY>300),{passive:true});})();</script>
  ${opts.scripts}
</body>
</html>`;
}
