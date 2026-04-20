/**
 * cookies.ts — parse, set, and clear HTTP cookies.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header || typeof header !== 'string') return {};

  return Object.fromEntries(
    header.split(';').map((pair) => {
      const [key, ...rest] = pair.trim().split('=');
      return [key.trim(), decodeURIComponent(rest.join('='))];
    }),
  );
}

// ── Set ───────────────────────────────────────────────────────────────────────

export function setCookie(res: ServerResponse, name: string, value: string, maxAge: number): void {
  res.setHeader(
    'Set-Cookie',
    [
      `${name}=${encodeURIComponent(value)}`,
      'HttpOnly',
      'SameSite=Strict',
      'Secure',
      `Max-Age=${Math.floor(maxAge / 1000)}`,
      'Path=/',
    ].join('; '),
  );
}

// ── Clear ─────────────────────────────────────────────────────────────────────

export function clearCookie(res: ServerResponse, name: string): void {
  res.setHeader(
    'Set-Cookie',
    [`${name}=`, 'HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=0', 'Path=/'].join('; '),
  );
}
