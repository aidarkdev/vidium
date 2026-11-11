import { bakeCinemaPage } from '../parts/cinema-page/baker.ts';
import type { CinemaContext } from '../parts/cinema-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

export function renderCinemaPage(ctx: CinemaContext): string {
  const page = bakeCinemaPage(ctx);
  return renderPartPage({
    lang: ctx.lang,
    isAdmin: ctx.isAdmin,
    baked: { [page.id]: page.state },
    body: mountScript('/parts/cinema-page/index.js', page.id),
  });
}
