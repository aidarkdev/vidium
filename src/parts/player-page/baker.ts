import { getVideoByUid } from '../../lib/video-queries.ts';
import { isGuestVisibleChannel } from '../../lib/guest-access.ts';
import { t } from '../../pages/lang.ts';
import { getCinemaVideo, cinemaFileReady } from '../../lib/cinema.ts';

interface PlayerBakeContext {
  kind: 'video' | 'audio';
  lang: string;
  params: Record<string, string>;
  cinema?: boolean;
}

export function bakePlayerPage(
  ctx: PlayerBakeContext,
): { ok: true; id: string; state: Record<string, unknown> } | { ok: false } {
  const uid = ctx.params.id;
  if (!uid) return { ok: false };

  const movie = ctx.cinema ? getCinemaVideo(uid) : undefined;
  if (ctx.cinema && (!movie || !cinemaFileReady(uid))) return { ok: false };
  const video = ctx.cinema
    ? movie && {
        title: movie.title,
        channelId: 0,
        channelName: t(ctx.lang, 'cinema.title'),
        duration: 0,
        chapters: [],
        videoStatus: 'ready',
        audioStatus: 'none',
      }
    : getVideoByUid(uid);
  if (!video) return { ok: false };

  const id = `player-${ctx.cinema ? 'cinema' : ctx.kind}-${uid}`;
  const mediaStatus = ctx.kind === 'video' ? video.videoStatus : video.audioStatus;

  return {
    ok: true,
    id,
    state: {
      kind: ctx.kind,
      uid,
      title: video.title,
      channelId: video.channelId,
      channelName: video.channelName,
      channelHref: ctx.cinema ? '/cinema' : video.channelId ? `/channel/${video.channelId}` : '',
      recordPlay: !ctx.cinema,
      mediaDurationSeconds: video.duration,
      chapters: video.chapters,
      resumeKey: `vidium:player-position:${ctx.cinema ? 'cinema' : ctx.kind}:${uid}`,
      mediaSrc: ctx.cinema
        ? `/cinema/media/${uid}`
        : ctx.kind === 'video'
          ? `/media/v/${uid}`
          : `/media/a/${uid}`,
      thumbSrc: ctx.cinema ? '' : `/t/${uid}`,
      backLabel: t(ctx.lang, 'player.back'),
      shareLabel: t(ctx.lang, 'player.share'),
      shareAvailable:
        !ctx.cinema && isGuestVisibleChannel(video.channelId) && mediaStatus === 'ready',
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
