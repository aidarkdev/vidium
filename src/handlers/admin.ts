/**
 * handlers/admin.ts — GET /admin
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { requireSession, html } from '../lib/http.ts';
import { renderAdminPage } from '../pages/admin.ts';

export function handleAdmin(req: IncomingMessage, res: ServerResponse): void {
  const session = requireSession(req, res);
  if (!session) return;

  html(res, renderAdminPage(session.data.lang ?? config.DEFAULT_LANG));
}
