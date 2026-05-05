/**
 * handlers/admin.ts — GET /admin
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession, html } from '../lib/http.ts';
import { getRecentJobs } from '../lib/queue.ts';
import { getDownloadedVideos, getProblemStatusRows, getVideoStatusSummary } from '../lib/video.ts';
import { renderAdminPage } from '../pages/admin.ts';
import { config } from '../config.ts';

export function handleAdmin(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) return;

  const lang = session.data.lang ?? config.DEFAULT_LANG;
  const jobs = getRecentJobs(200);
  const statusSummary = getVideoStatusSummary();
  const problemRows = getProblemStatusRows(200);
  const downloadedVideos = getDownloadedVideos(300);

  html(
    res,
    renderAdminPage({
      lang,
      jobs,
      statusSummary,
      problemRows,
      downloadedVideos,
    }),
  );
}
