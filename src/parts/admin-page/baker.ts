import { getRecentJobs } from '../../lib/queue.ts';
import { readDiskStatus } from '../../lib/disk-status.ts';
import { readProxyStatus } from '../../lib/proxy-status.ts';
import { listUsers } from '../../lib/auth/auth.ts';
import { getAllChannels } from '../../lib/channel.ts';
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
      channels: getAllChannels(),
      currentUserId: ctx.currentUserId,
      statusSummary: getVideoStatusSummary(),
      problemRows: getProblemStatusRows(200),
      downloadedVideos: getDownloadedVideos(300),
      diskStatus: readDiskStatus(),
      proxyStatus: readProxyStatus(),
      pendingAction: null,
      pendingUserRoleId: 0,
      pendingChannelTagsId: 0,
      pendingChannelAutoDownloadKey: '',
      pendingChannelGuestVisibleId: 0,
      errorMessage: '',
      eventReload: 0,
      empty: t(lang, 'admin.empty'),
      contentsTitle: t(lang, 'admin.contents'),
      contentsLink: t(lang, 'admin.back_to_contents'),
      sections: {
        disk: t(lang, 'admin.disk'),
        proxy: t(lang, 'admin.proxy'),
        jobs: t(lang, 'admin.jobs'),
        users: t(lang, 'admin.users'),
        channels: t(lang, 'admin.channels'),
        statuses: t(lang, 'admin.statuses'),
        problemRows: t(lang, 'admin.problem_rows'),
        downloaded: t(lang, 'admin.downloaded'),
      },
      disk: {
        title: t(lang, 'admin.disk'),
        free: t(lang, 'admin.disk.free'),
        busy: t(lang, 'admin.disk.busy'),
        invalid: t(lang, 'admin.disk.invalid'),
        used: t(lang, 'admin.disk.used'),
        available: t(lang, 'admin.disk.available'),
        total: t(lang, 'admin.disk.total'),
        usage: t(lang, 'admin.disk.usage'),
        cleanupAt: t(lang, 'admin.disk.cleanup_at'),
        error: t(lang, 'admin.disk.error'),
      },
      proxy: {
        title: t(lang, 'admin.proxy'),
        ok: t(lang, 'admin.proxy.ok'),
        failed: t(lang, 'admin.proxy.failed'),
        invalid: t(lang, 'admin.proxy.invalid'),
        checkedAt: t(lang, 'admin.proxy.checked_at'),
        attempts: t(lang, 'admin.proxy.attempts'),
        latency: t(lang, 'admin.proxy.latency'),
        url: t(lang, 'admin.proxy.url'),
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
        channel: t(lang, 'admin.col.channel'),
        url: t(lang, 'admin.col.url'),
        tags: t(lang, 'admin.col.tags'),
        autoVideo: t(lang, 'admin.col.auto_video'),
        autoAudio: t(lang, 'admin.col.auto_audio'),
        guestVisible: t(lang, 'admin.col.guest_visible'),
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
        resetStatus: t(lang, 'admin.action.reset_status'),
        save: t(lang, 'admin.action.save'),
        saving: t(lang, 'admin.action.saving'),
        deleting: t(lang, 'admin.action.deleting'),
        resetting: t(lang, 'admin.action.resetting'),
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
