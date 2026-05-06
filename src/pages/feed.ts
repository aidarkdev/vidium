import { bakeFeedPage } from '../parts/feed-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

interface FeedRenderContext {
  lang: string;
  params: Record<string, string>;
  isAdmin: boolean;
}

export function renderFeedPage(ctx: FeedRenderContext): string {
  const page = bakeFeedPage(ctx);

  return renderPartPage({
    lang: ctx.lang,
    title: page.title,
    isAdmin: ctx.isAdmin,
    baked: { [page.id]: page.state },
    /**
     * MacroState contract:
     * - owns: feed-page.title
     * - mirrors: editMode <- nav-controls.sidebarEdit
     */
    body: mountScript('/parts/feed-page/index.js', page.id, {
      expose: ['title'],
      subscribe: { editMode: 'nav-controls.sidebarEdit' },
    }),
  });
}
