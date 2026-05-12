import { getRecentJobs } from '../../lib/queue.ts';
import { readProxyStatus } from '../../lib/proxy-status.ts';
import { listUsers } from '../../lib/auth/auth.ts';
import { getDownloadedVideos, getProblemStatusRows, getVideoStatusSummary } from '../../lib/video.ts';
import { t } from '../../pages/lang.ts';

interface AdminBakeContext {
  lang: string;
  currentUserId: number;
}

export function bakeAdminPage(ctx: AdminBakeContext): {
  id: string;
  title: string;
  state: Record<string, unknown>;
} {
  const { lang } = ctx;
  const title = t(lang, 'admin.title');

  return {
    id: 'admin-page',
    title,
    state: {
      title,
      jobs: getRecentJobs(200),
      users: listUsers(),
      currentUserId: ctx.currentUserId,
      statusSummary: getVideoStatusSummary(),
      problemRows: getProblemStatusRows(200),
      downloadedVideos: getDownloadedVideos(300),
      proxyStatus: readProxyStatus(),
      pendingAction: null,
      pendingUserRoleId: 0,
      errorMessage: '',
      eventReload: 0,
      empty: t(lang, 'admin.empty'),
      contentsTitle: t(lang, 'admin.contents'),
      contentsLink: t(lang, 'admin.back_to_contents'),
      sections: {
        proxy: t(lang, 'admin.proxy'),
        jobs: t(lang, 'admin.jobs'),
        users: t(lang, 'admin.users'),
        statuses: t(lang, 'admin.statuses'),
        problemRows: t(lang, 'admin.problem_rows'),
        downloaded: t(lang, 'admin.downloaded'),
      },
      proxy: {
        title: t(lang, 'admin.proxy'),
        ok: t(lang, 'admin.proxy.ok'),
        failed: t(lang, 'admin.proxy.failed'),
        invalid: t(lang, 'admin.proxy.invalid'),
        checkedAt: t(lang, 'admin.proxy.checked_at'),
        error: t(lang, 'admin.proxy.error'),
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
        login: t(lang, 'admin.col.login'),
        admin: t(lang, 'admin.col.admin'),
        video: t(lang, 'admin.col.video'),
        audio: t(lang, 'admin.col.audio'),
        actions: t(lang, 'admin.col.actions'),
      },
      actions: {
        deleteFiles: t(lang, 'admin.action.delete_files'),
        deleteVideo: t(lang, 'admin.action.delete_video'),
        deleteJob: t(lang, 'admin.action.delete_job'),
        saving: t(lang, 'admin.action.saving'),
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
