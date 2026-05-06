import { bakeFeedPage } from '../parts/feed-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

interface FeedRenderContext {
  lang: string;
  params: Record<string, string>;
}

export function renderFeedPage(ctx: FeedRenderContext): string {
  const page = bakeFeedPage(ctx);

  return renderPartPage({
    lang: ctx.lang,
    title: page.title,
    baked: { [page.id]: page.state },
    body: mountScript('/parts/feed-page/index.js', page.id, {
      expose: ['title'],
      subscribe: { editMode: 'nav-controls.sidebarEdit' },
    }),
  });
}
