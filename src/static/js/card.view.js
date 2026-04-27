/**
 * card.view.js — card HTML template functions.
 * Receives all formatting/action dependencies from card.js.
 */

const _CardView = Object.freeze({
  renderCardView(card, ctx) {
    return `<article class="card" data-id="${ctx.esc(card.youtubeId)}">
      <img class="card-thumb" src="/t/${ctx.esc(card.youtubeId)}" alt="${ctx.esc(card.title)}" loading="lazy">
      <div class="card-body">
        <h2 class="card-title">
          ${card.channelName ? `<div class="card-channel">${ctx.esc(ctx.resolveChannelName(card.channelName))}</div>` : ''}<div class="card-title-text">${ctx.esc(card.title)}</div>
        </h2>
        <div class="card-meta">
          <span class="card-date">${ctx.esc(ctx.formatDate(card.date))}</span>
          ${card.duration ? `<span class="card-duration">${ctx.formatDuration(card.duration)}</span>` : ''}
        </div>
        <div class="card-actions">
          ${ctx.getActionsHtml(card.youtubeId, card.videoStatus, card.audioStatus)}
        </div>
      </div>
    </article>`;
  },
});
