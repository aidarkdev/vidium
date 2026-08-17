/**
 * video.ts — compatibility facade for video queries and mutations.
 */

export {
  DEFAULT_VIDEO_PAGE_SIZE,
  getDownloadedVideos,
  getGuestVideoPage,
  getNewReadyVideosSince,
  getNewVideosSince,
  getNewVideosSinceByChannel,
  getNewVideosSinceByTag,
  getProblemStatusRows,
  getVideoByUid,
  getVideoByYoutubeId,
  getVideoPage,
  getVideoStatusSummary,
  toPublicVideoRow,
} from './video-queries.ts';
export type {
  DownloadedVideoRow,
  PublicVideoRow,
  VideoChapter,
  VideoEntry,
  VideoPage,
  VideoPageQuery,
  VideoRow,
  VideoStatusRow,
  VideoStatusSummary,
} from './video-queries.ts';
export {
  deleteVideoByYoutubeId,
  generateVideoUid,
  insertVideos,
  setAudioStatus,
  setDurationIfZero,
  setMediaStatusesNone,
  setVideoChapters,
  setVideoStatus,
  videoExists,
} from './video-mutations.ts';
