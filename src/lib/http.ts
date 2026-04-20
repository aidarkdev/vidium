/**
 * http.ts — shared request/response helpers for handlers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseCookies } from './auth/cookies.ts';
import { getSession } from './auth/sessions.ts';
import type { Session } from './auth/sessions.ts';

export function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'";

export function html(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': CSP,
  });
  res.end(body);
}

/** Returns true if the request passes a same-origin check; responds 403 otherwise. */
export function checkCsrf(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host ?? '';
  if (origin === `https://${host}` || origin === `http://${host}`) return true;
  json(res, 403, { error: 'forbidden' });
  return false;
}

export function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function notFound(res: ServerResponse, message = 'Not found'): void {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(message);
}

export function readBody(req: IncomingMessage, maxBytes = 8192): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        return reject(new Error('body too large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function parseForm(body: string): Record<string, string> {
  return Object.fromEntries(
    body
      .split('&')
      .map((pair) => pair.split('=').map((s) => decodeURIComponent(s.replace(/\+/g, ' ')))),
  );
}

export function getQuery(req: IncomingMessage): Record<string, string> {
  const url = req.url ?? '';
  const qs = url.includes('?') ? url.split('?')[1] : '';
  return Object.fromEntries(qs.split('&').map((p) => p.split('=').map(decodeURIComponent)));
}

/** Returns session or redirects to /login. Use in HTML handlers. */
export function requireSession(req: IncomingMessage, res: ServerResponse): Session | undefined {
  const cookies = parseCookies(req);
  const session = cookies.sid ? getSession(cookies.sid) : undefined;
  if (!session) redirect(res, '/login');
  return session;
}

/** Returns true or responds with JSON 401. Use in API handlers. */
export function requireSessionApi(req: IncomingMessage, res: ServerResponse): boolean {
  const cookies = parseCookies(req);
  const session = cookies.sid ? getSession(cookies.sid) : undefined;
  if (!session) {
    json(res, 401, { error: 'unauthorized' });
    return false;
  }
  return true;
}
