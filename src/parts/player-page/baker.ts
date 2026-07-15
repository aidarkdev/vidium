import { getVideoByUid } from '../../lib/video.ts';
import { isGuestVisibleChannel } from '../../lib/guest-access.ts';
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
  const mediaStatus = ctx.kind === 'video' ? video.videoStatus : video.audioStatus;

  return {
    ok: true,
    id,
    title: video.title,
    state: {
      kind: ctx.kind,
      uid,
      title: video.title,
      channelId: video.channelId,
      channelName: video.channelName,
      mediaDurationSeconds: video.duration,
      chapters: video.chapters,
      resumeKey: `vidium:player-position:${ctx.kind}:${uid}`,
      mediaSrc: ctx.kind === 'video' ? `/media/v/${uid}` : `/media/a/${uid}`,
      thumbSrc: `/t/${uid}`,
      backLabel: t(ctx.lang, 'player.back'),
      shareLabel: t(ctx.lang, 'player.share'),
      shareAvailable: isGuestVisibleChannel(video.channelId) && mediaStatus === 'ready',
      sleepLabel: t(ctx.lang, 'player.sleep'),
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
      shareStatus: 'idle',
      sleepDurationSeconds: 20 * 60,
      sleepDeadline: 0,
      sleepRemainingSeconds: 20 * 60,
    },
  };
}
