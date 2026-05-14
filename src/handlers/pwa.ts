import type { IncomingMessage, ServerResponse } from 'node:http';

const MANIFEST = {
  id: '/',
  name: 'vidium',
  short_name: 'vidium',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#111111',
  theme_color: '#111111',
  icons: [
    {
      src: '/static/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any maskable',
    },
    {
      src: '/static/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable',
    },
  ],
};

const SERVICE_WORKER = `
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
`.trimStart();

export function handleManifest(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
): void {
  res.writeHead(200, {
    'Content-Type': 'application/manifest+json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(MANIFEST));
}

export function handleServiceWorker(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Service-Worker-Allowed': '/',
  });
  res.end(SERVICE_WORKER);
}
