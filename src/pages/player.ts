import { mountScript, renderPartPage } from './part-page.ts';

export function renderPlayerPage(lang: string, id: string, state: Record<string, unknown>): string {
  return renderPartPage({
    title: String(state.title ?? 'vidium'),
    lang,
    baked: { [id]: state },
    body: mountScript('/parts/player-page/index.js', id),
  });
}
