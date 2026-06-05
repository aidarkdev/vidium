import { getVideoByUid } from '../../lib/video.ts';
import { t } from '../../pages/lang.ts';

interface PlayerBakeContext {
  kind: 'video' | 'audio';
  lang: string;
  params: Record<string, string>;
}

export function bakePlayerPage(
  ctx: PlayerBakeContext,
): { ok: true; id: string; title: string; state: Record<string, unknown> } | { ok: false; message: string } {
  const uid = ctx.params.id;
  if (!uid) return { ok: false, message: 'Not found' };

  const video = getVideoByUid(uid);
  if (!video) return { ok: false, message: 'Not found' };

  const id = `player-${ctx.kind}-${uid}`;

  return {
    ok: true,
    id,
    title: video.title,
    state: {
      kind: ctx.kind,
      uid,
      title: video.title,
      channelName: video.channelName,
      chapters: video.chapters,
      resumeKey: `vidium:player-position:${ctx.kind}:${uid}`,
      mediaSrc: ctx.kind === 'video' ? `/media/v/${uid}` : `/media/a/${uid}`,
      thumbSrc: ctx.kind === 'audio' ? `/t/${uid}` : '',
      backLabel: t(ctx.lang, 'player.back'),
      eventBack: 0,
      seekDelta: 0,
      eventSeek: 0,
      chapterSeekTime: 0,
      eventChapterSeek: 0,
      activeChapterStart: -1,
      resumeTime: 0,
      eventResume: 0,
      eventPlay: 0,
      playbackRate: 1,
      paused: true,
    },
  };
}
