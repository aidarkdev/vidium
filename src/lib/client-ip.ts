/**
 * client-ip.ts — trusted client IP extraction for requests behind local nginx.
 */

import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

const TRUSTED_PROXY_REMOTES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validIp(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return isIP(trimmed) ? trimmed : undefined;
}

export function getTrustedClientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? 'unknown';
  if (!TRUSTED_PROXY_REMOTES.has(remote)) return remote;

  return validIp(firstHeaderValue(req.headers['x-real-ip'])) ?? remote;
}
