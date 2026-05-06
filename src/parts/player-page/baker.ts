import { getVideoById } from '../../lib/video.ts';
import { t } from '../../pages/lang.ts';

interface PlayerBakeContext {
  kind: 'video' | 'audio';
  lang: string;
  params: Record<string, string>;
}

export function bakePlayerPage(
  ctx: PlayerBakeContext,
): { ok: true; id: string; title: string; state: Record<string, unknown> } | { ok: false; message: string } {
  const youtubeId = ctx.params.id;
  if (!youtubeId) return { ok: false, message: 'Not found' };

  const video = getVideoById(youtubeId);
  if (!video) return { ok: false, message: 'Not found' };

  const id = `player-${ctx.kind}-${youtubeId}`;

  return {
    ok: true,
    id,
    title: video.title,
    state: {
      kind: ctx.kind,
      title: video.title,
      channelName: video.channelName,
      mediaSrc: ctx.kind === 'video' ? `/media/v/${youtubeId}` : `/media/a/${youtubeId}`,
      thumbSrc: ctx.kind === 'audio' ? `/t/${youtubeId}` : '',
      backLabel: t(ctx.lang, 'player.back'),
      eventBack: 0,
      seekDelta: 0,
      eventSeek: 0,
      eventPlay: 0,
      paused: true,
    },
  };
}
