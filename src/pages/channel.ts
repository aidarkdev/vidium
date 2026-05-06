import { bakeChannelPage } from '../parts/feed-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

interface ChannelRenderContext {
  lang: string;
  params: Record<string, string>;
  isAdmin: boolean;
}

export function renderChannelPage(ctx: ChannelRenderContext): string | undefined {
  const page = bakeChannelPage(ctx);
  if (!page.ok) return undefined;

  return renderPartPage({
    lang: ctx.lang,
    title: page.title,
    isAdmin: ctx.isAdmin,
    baked: { [page.id]: page.state },
    /**
     * MacroState contract:
     * - owns: {page.id}.title
     * - mirrors: editMode <- nav-controls.sidebarEdit
     */
    body: mountScript('/parts/feed-page/index.js', page.id, {
      expose: ['title'],
      subscribe: { editMode: 'nav-controls.sidebarEdit' },
    }),
  });
}
