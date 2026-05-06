/**
 * handlers/admin.ts — GET /admin
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { requireAdmin, html } from '../lib/http.ts';
import { renderAdminPage } from '../pages/admin.ts';

export function handleAdmin(req: IncomingMessage, res: ServerResponse): void {
  const session = requireAdmin(req, res);
  if (!session) return;

  html(
    res,
    renderAdminPage({
      lang: session.data.lang ?? config.DEFAULT_LANG,
      currentUserId: session.userId,
      isAdmin: session.role === 'admin',
    }),
  );
}
