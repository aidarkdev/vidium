/**
 * server.ts — HTTP server entry point.
 *
 * Startup:
 *   node --env-file=.env src/server.ts
 */

import { createServer } from 'node:http';
import { config } from './config.ts';
import { Router } from './lib/router.ts';

import { handleLogin, handleRegister, handleLogout, handleLang } from './handlers/auth.ts';
import { handleFeed } from './handlers/feed.ts';
import { handleChannel } from './handlers/channel.ts';
import {
  handleVideo,
  handleAudio,
  handleMediaVideo,
  handleMediaAudio,
  handleThumb,
} from './handlers/video.ts';
import {
  handleDownload,
  handleStatus,
  handleSince,
  handleAddChannel,
  handleAddVideo,
  handleSetTagLabel,
} from './handlers/api.ts';

const router = new Router();

// Auth
router.get('/login', handleLogin);
router.post('/login', handleLogin);
router.get('/register', handleRegister);
router.post('/register', handleRegister);
router.post('/logout', handleLogout);
router.get('/lang/:code', handleLang);

// Feed
router.get('/', handleFeed);
router.get('/feed', handleFeed);
router.get('/feed/:tag', handleFeed);

// Channel
router.get('/channel/:id', handleChannel);

// Player pages
router.get('/v/:id', handleVideo);
router.get('/a/:id', handleAudio);

// Raw media — Node authorizes, nginx serves via X-Accel-Redirect
router.get('/media/v/:id', handleMediaVideo);
router.get('/media/a/:id', handleMediaAudio);
router.get('/t/:id', handleThumb);

// API
router.post('/api/download', handleDownload);
router.post('/api/channel', handleAddChannel);
router.post('/api/video', handleAddVideo);
router.post('/api/tag-label', handleSetTagLabel);
router.get('/api/status', handleStatus);
router.get('/api/since', handleSince);

// Server
const server = createServer((req, res) => {
  router.dispatch(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  });
});

server.listen(config.PORT, config.HOST, () => {
  console.log(`server listening on ${config.HOST}:${config.PORT}`);
});
