import { bakeChannelPage } from '../parts/feed-page/baker.ts';
import { bakeFeedCardPager } from '../parts/feed-card-pager/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

interface ChannelRenderContext {
  lang: string;
  params: Record<string, string>;
  isAdmin: boolean;
  sidebarMode?: 'channels' | 'tags';
  page?: number;
}

export function renderChannelPage(ctx: ChannelRenderContext): string | undefined {
  const page = bakeChannelPage(ctx);
  if (!page.ok) return undefined;
  const channelId = Number.parseInt(ctx.params.id, 10);
  const pager = bakeFeedCardPager({
    id: `channel-card-pager-${channelId}`,
    lang: ctx.lang,
    page: ctx.page,
    activeTag: '',
    activeChannelId: channelId,
  });

  return renderPartPage({
    lang: ctx.lang,
    title: page.title,
    isAdmin: ctx.isAdmin,
    baked: { [page.id]: page.state, [pager.id]: pager.state },
    mainClass: 'feed-main',
    bodyClass: 'feed-layout',
    /**
     * MacroState contract:
     * - owns: {page.id}.title
     * - mirrors: editMode <- nav-controls.sidebarEdit
     */
    body: `${mountScript('/parts/feed-page/index.js', page.id, {
      expose: ['title'],
      subscribe: { editMode: 'nav-controls.sidebarEdit' },
    })}
      ${mountScript('/parts/feed-card-pager/index.js', pager.id)}`,
  });
}
