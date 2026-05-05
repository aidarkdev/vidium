import { bakePlayerPage } from '../parts/player-page/baker.ts';
import { mountScript, renderPartPage } from './part-page.ts';

interface PlayerRenderContext {
  kind: 'video' | 'audio';
  lang: string;
  params: Record<string, string>;
}

export function renderPlayerPage(ctx: PlayerRenderContext): string | undefined {
  const page = bakePlayerPage(ctx);
  if (!page.ok) return undefined;

  return renderPartPage({
    title: page.title,
    lang: ctx.lang,
    baked: { [page.id]: page.state },
    body: mountScript('/parts/player-page/index.js', page.id),
  });
}
