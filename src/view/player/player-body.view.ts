export interface PlayerBodyOptions {
  mediaHtml: string;
  channelHtml: string;
  title: string;
  backLabel: string;
}

export function renderPlayerBody(opts: PlayerBodyOptions): string {
  return `<div class="player">
    ${opts.mediaHtml}
    <div class="player-title">
      ${opts.channelHtml}
      <div class="player-title-text">${opts.title}</div>
    </div>
    <button class="player-back" onclick="history.length > 1 ? history.back() : (location.href='/feed')">&larr; ${opts.backLabel}</button>
  </div>`;
}
