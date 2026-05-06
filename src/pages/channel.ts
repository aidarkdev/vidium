import { bakeChannelPage } from '../parts/feed-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

interface ChannelRenderContext {
  lang: string;
  params: Record<string, string>;
}

export function renderChannelPage(ctx: ChannelRenderContext): string | undefined {
  const page = bakeChannelPage(ctx);
  if (!page.ok) return undefined;

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
