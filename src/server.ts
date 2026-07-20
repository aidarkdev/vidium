/**
 * server.ts — HTTP server entry point.
 *
 * Startup:
 *   node --env-file=.env src/server.ts
 */

import { createServer } from 'node:http';
import { config } from './config.ts';
import { loadAssetManifest } from './lib/assets.ts';
import { NO_STORE } from './lib/http.ts';
import { Router } from './lib/router.ts';
import type { Handler } from './lib/router.ts';

import { handleLogin, handleRegister, handleLogout, handleLang } from './handlers/auth.ts';
import { handleFeed } from './handlers/feed.ts';
import { handleChannel } from './handlers/channel.ts';
import { handleAdmin } from './handlers/admin.ts';
import { handleManifest, handleServiceWorker } from './handlers/pwa.ts';
import {
  handleVideo,
  handleAudio,
  handleMediaVideo,
  handleMediaAudio,
  handleThumb,
} from './handlers/video.ts';
import {
  handleDownload,
  handlePlay,
  handleSidebarMode,
  handleStatus,
  handleSince,
  handleAddChannel,
  handleAddVideo,
  handleSetChannelDisplayName,
  handleSetChannelAutoDownload,
  handleSetChannelGuestVisible,
  handleSetChannelRssEnabled,
  handleSetChannelTags,
  handleDeleteTag,
  handleReorderTag,
  handleReorderChannel,
  handleAdminDeleteVideoFiles,
  handleAdminDeleteVideo,
  handleAdminDeleteJob,
  handleAdminResetVideoStatus,
  handleAdminSetUserRole,
  handleFeedCards,
} from './handlers/api.ts';

type RouteMethod = 'get' | 'post';

interface RouteConfig {
  method: RouteMethod;
  path: string;
  handler: Handler;
}

const routes: RouteConfig[] = [
  // PWA
  { method: 'get', path: '/manifest.webmanifest', handler: handleManifest },
  { method: 'get', path: '/sw.js', handler: handleServiceWorker },

  // Auth
  {
    method: 'get',
    path: '/login',
    handler: handleLogin,
  },
  {
    method: 'post',
    path: '/login',
    handler: handleLogin,
  },
  {
    method: 'get',
    path: '/register',
    handler: handleRegister,
  },
  {
    method: 'post',
    path: '/register',
    handler: handleRegister,
  },
  {
    method: 'post',
    path: '/logout',
    handler: handleLogout,
  },
  {
    method: 'get',
    path: '/lang/:code',
    handler: handleLang,
  },

  // Feed
  {
    method: 'get',
    path: '/',
    handler: handleFeed,
  },
  {
    method: 'get',
    path: '/feed',
    handler: handleFeed,
  },
  {
    method: 'get',
    path: '/feed/:tag',
    handler: handleFeed,
  },

  // Channel/admin
  {
    method: 'get',
    path: '/channel/:id',
    handler: handleChannel,
  },
  {
    method: 'get',
    path: '/admin',
    handler: handleAdmin,
  },

  // Player pages
  {
    method: 'get',
    path: '/v/:id',
    handler: handleVideo,
  },
  {
    method: 'get',
    path: '/a/:id',
    handler: handleAudio,
  },

  // Raw media — Node authorizes, nginx serves via X-Accel-Redirect
  {
    method: 'get',
    path: '/media/v/:id',
    handler: handleMediaVideo,
  },
  {
    method: 'get',
    path: '/media/a/:id',
    handler: handleMediaAudio,
  },
  {
    method: 'get',
    path: '/t/:id',
    handler: handleThumb,
  },

  // API
  {
    method: 'post',
    path: '/api/download',
    handler: handleDownload,
  },
  {
    method: 'post',
    path: '/api/play',
    handler: handlePlay,
  },
  {
    method: 'post',
    path: '/api/sidebar/mode',
    handler: handleSidebarMode,
  },
  {
    method: 'post',
    path: '/api/channel',
    handler: handleAddChannel,
  },
  {
    method: 'post',
    path: '/api/video',
    handler: handleAddVideo,
  },
  {
    method: 'post',
    path: '/api/channel/display-name',
    handler: handleSetChannelDisplayName,
  },
  {
    method: 'post',
    path: '/api/channel/tags',
    handler: handleSetChannelTags,
  },
  {
    method: 'post',
    path: '/api/channel/auto-download',
    handler: handleSetChannelAutoDownload,
  },
  {
    method: 'post',
    path: '/api/channel/guest-visible',
    handler: handleSetChannelGuestVisible,
  },
  {
    method: 'post',
    path: '/api/channel/rss-enabled',
    handler: handleSetChannelRssEnabled,
  },
  {
    method: 'post',
    path: '/api/channel/reorder',
    handler: handleReorderChannel,
  },
  {
    method: 'post',
    path: '/api/tag/reorder',
    handler: handleReorderTag,
  },
  {
    method: 'post',
    path: '/api/tag/delete',
    handler: handleDeleteTag,
  },
  {
    method: 'post',
    path: '/api/admin/video/files/delete',
    handler: handleAdminDeleteVideoFiles,
  },
  {
    method: 'post',
    path: '/api/admin/video/delete',
    handler: handleAdminDeleteVideo,
  },
  {
    method: 'post',
    path: '/api/admin/job/delete',
    handler: handleAdminDeleteJob,
  },
  {
    method: 'post',
    path: '/api/admin/video/status/reset',
    handler: handleAdminResetVideoStatus,
  },
  {
    method: 'post',
    path: '/api/admin/user/role',
    handler: handleAdminSetUserRole,
  },
  {
    method: 'get',
    path: '/api/status',
    handler: handleStatus,
  },
  {
    method: 'get',
    path: '/api/since',
    handler: handleSince,
  },
  {
    method: 'get',
    path: '/api/feed/cards',
    handler: handleFeedCards,
  },
];

const router = new Router();

for (const route of routes) {
  router[route.method](route.path, route.handler);
}

// Server
loadAssetManifest(config.ASSET_MANIFEST_PATH);

const server = createServer((req, res) => {
  router.dispatch(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain', 'Cache-Control': NO_STORE });
      res.end('Internal server error');
    }
  });
});

server.listen(config.PORT, config.HOST, () => {
  console.log(`server listening on ${config.HOST}:${config.PORT}`);
});
