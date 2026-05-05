import { t } from './lang.ts';
import { mountScript, renderPartPage } from './part-page.ts';
import type { JobAdminRow } from '../lib/queue.ts';
import type { DownloadedVideoRow, VideoStatusRow, VideoStatusSummary } from '../lib/video.ts';

interface AdminPageOptions {
  lang: string;
  jobs: JobAdminRow[];
  statusSummary: VideoStatusSummary[];
  problemRows: VideoStatusRow[];
  downloadedVideos: DownloadedVideoRow[];
}

function adminState(opts: AdminPageOptions): Record<string, unknown> {
  return {
    title: t(opts.lang, 'admin.title'),
    jobs: opts.jobs,
    statusSummary: opts.statusSummary,
    problemRows: opts.problemRows,
    downloadedVideos: opts.downloadedVideos,
    pendingAction: null,
    errorMessage: '',
    reloadRequested: 0,
    empty: t(opts.lang, 'admin.empty'),
    sections: {
      jobs: t(opts.lang, 'admin.jobs'),
      statuses: t(opts.lang, 'admin.statuses'),
      problemRows: t(opts.lang, 'admin.problem_rows'),
      downloaded: t(opts.lang, 'admin.downloaded'),
    },
    cols: {
      id: t(opts.lang, 'admin.col.id'),
      type: t(opts.lang, 'admin.col.type'),
      status: t(opts.lang, 'admin.col.status'),
      attempts: t(opts.lang, 'admin.col.attempts'),
      youtubeId: t(opts.lang, 'admin.col.youtube_id'),
      error: t(opts.lang, 'admin.col.error'),
      createdAt: t(opts.lang, 'admin.col.created_at'),
      readyAt: t(opts.lang, 'admin.col.ready_at'),
      title: t(opts.lang, 'admin.col.title'),
      video: t(opts.lang, 'admin.col.video'),
      audio: t(opts.lang, 'admin.col.audio'),
      actions: t(opts.lang, 'admin.col.actions'),
    },
    actions: {
      deleteFiles: t(opts.lang, 'admin.action.delete_files'),
      deleteVideo: t(opts.lang, 'admin.action.delete_video'),
      deleteJob: t(opts.lang, 'admin.action.delete_job'),
      deleting: t(opts.lang, 'admin.action.deleting'),
      error: t(opts.lang, 'admin.error.action_failed'),
    },
    confirm: {
      deleteFiles: t(opts.lang, 'admin.confirm.delete_files'),
      deleteVideo: t(opts.lang, 'admin.confirm.delete_video'),
      deleteJob: t(opts.lang, 'admin.confirm.delete_job'),
    },
  };
}

export function renderAdminPage(opts: AdminPageOptions): string {
  const id = 'admin-page';

  return renderPartPage({
    lang: opts.lang,
    title: t(opts.lang, 'admin.title'),
    baked: { [id]: adminState(opts) },
    body: mountScript('/parts/admin-page/index.js', id),
  });
}
