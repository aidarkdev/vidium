import { bakeFeedPage } from '../parts/feed-page/baker.ts';
import { bakeFeedCardPager } from '../parts/feed-card-pager/baker.ts';
import type { ViewerMode } from '../lib/guest-access.ts';
import { mountScript, renderPartPage } from './part-page.ts';

interface FeedRenderContext {
  lang: string;
  params: Record<string, string>;
  isAdmin: boolean;
  sidebarMode?: 'channels' | 'tags';
  page?: number;
  viewerMode?: ViewerMode;
}

export function renderFeedPage(ctx: FeedRenderContext): string {
  const page = bakeFeedPage(ctx);
  const pager = bakeFeedCardPager({
    id: 'feed-card-pager',
    lang: ctx.lang,
    page: ctx.page,
    activeTag: ctx.params.tag ?? 'all',
    viewerMode: ctx.viewerMode,
    allowDownload: ctx.viewerMode !== 'guest',
  });

  return renderPartPage({
    lang: ctx.lang,
    title: page.title,
    isAdmin: ctx.isAdmin,
    isGuest: ctx.viewerMode === 'guest',
    baked: { [page.id]: page.state, [pager.id]: pager.state },
    mainClass: 'feed-main',
    bodyClass: 'feed-layout',
    /**
     * MacroState contract:
     * - owns: feed-page.title
     * - mirrors: editMode <- nav-controls.sidebarEdit
     */
    body: `${mountScript('/parts/feed-page/index.js', page.id, {
      expose: ['title'],
      subscribe: { editMode: 'nav-controls.sidebarEdit' },
    })}
      ${mountScript('/parts/feed-card-pager/index.js', pager.id)}`,
  });
}
