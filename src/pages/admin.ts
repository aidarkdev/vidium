import { bakeAdminPage } from '../parts/admin-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

export function renderAdminPage(lang: string): string {
  const page = bakeAdminPage(lang);

  return renderPartPage({
    lang,
    title: page.title,
    baked: { [page.id]: page.state },
    body: mountScript('/parts/admin-page/index.js', page.id),
  });
}
