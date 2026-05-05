import { getRecentJobs } from '../../lib/queue.ts';
import { getDownloadedVideos, getProblemStatusRows, getVideoStatusSummary } from '../../lib/video.ts';
import { t } from '../../pages/lang.ts';

export function bakeAdminPage(lang: string): { id: string; title: string; state: Record<string, unknown> } {
  const title = t(lang, 'admin.title');

  return {
    id: 'admin-page',
    title,
    state: {
      title,
      jobs: getRecentJobs(200),
      statusSummary: getVideoStatusSummary(),
      problemRows: getProblemStatusRows(200),
      downloadedVideos: getDownloadedVideos(300),
      pendingAction: null,
      errorMessage: '',
      reloadRequested: 0,
      empty: t(lang, 'admin.empty'),
      sections: {
        jobs: t(lang, 'admin.jobs'),
        statuses: t(lang, 'admin.statuses'),
        problemRows: t(lang, 'admin.problem_rows'),
        downloaded: t(lang, 'admin.downloaded'),
      },
      cols: {
        id: t(lang, 'admin.col.id'),
        type: t(lang, 'admin.col.type'),
        status: t(lang, 'admin.col.status'),
        attempts: t(lang, 'admin.col.attempts'),
        youtubeId: t(lang, 'admin.col.youtube_id'),
        error: t(lang, 'admin.col.error'),
        createdAt: t(lang, 'admin.col.created_at'),
        readyAt: t(lang, 'admin.col.ready_at'),
        title: t(lang, 'admin.col.title'),
        video: t(lang, 'admin.col.video'),
        audio: t(lang, 'admin.col.audio'),
        actions: t(lang, 'admin.col.actions'),
      },
      actions: {
        deleteFiles: t(lang, 'admin.action.delete_files'),
        deleteVideo: t(lang, 'admin.action.delete_video'),
        deleteJob: t(lang, 'admin.action.delete_job'),
        deleting: t(lang, 'admin.action.deleting'),
        error: t(lang, 'admin.error.action_failed'),
      },
      confirm: {
        deleteFiles: t(lang, 'admin.confirm.delete_files'),
        deleteVideo: t(lang, 'admin.confirm.delete_video'),
        deleteJob: t(lang, 'admin.confirm.delete_job'),
      },
    },
  };
}
