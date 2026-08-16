/**
 * proxy-status.ts — reads the optional proxy check status file for admin UI.
 */

import { readFileSync, statSync } from 'node:fs';
import { config } from '../config.ts';

type ProxyStatusState = 'ok' | 'failed' | 'invalid';

export interface ProxyStatus {
  state: ProxyStatusState;
  checkedAt: string;
  error: string;
  url: string;
  attempts: number;
  latencyMs: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function shortString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

export function readProxyStatus(): ProxyStatus | null {
  if (!config.YTDLP_PROXY) return null;

  const path = config.PROXY_STATUS_PATH;
  if (!path) return null;

  try {
    if (statSync(path).size > 4096) {
      return {
        state: 'invalid',
        checkedAt: '',
        error: 'proxy status file is too large',
        url: '',
        attempts: 0,
        latencyMs: 0,
      };
    }

    const raw = readFileSync(path, 'utf8');
    const data = asRecord(JSON.parse(raw));
    if (!data) {
      return {
        state: 'invalid',
        checkedAt: '',
        error: 'proxy status JSON is invalid',
        url: '',
        attempts: 0,
        latencyMs: 0,
      };
    }

    const checkedAt = shortString(data.checkedAt, 64);
    if (!checkedAt) {
      return {
        state: 'invalid',
        checkedAt: '',
        error: 'proxy status checkedAt is missing',
        url: '',
        attempts: 0,
        latencyMs: 0,
      };
    }

    const state =
      typeof data.ok === 'boolean'
        ? data.ok
          ? 'ok'
          : 'failed'
        : data.state === 'ok' || data.state === 'failed'
          ? data.state
          : null;

    if (!state) {
      return {
        state: 'invalid',
        checkedAt,
        error: 'proxy status state is invalid',
        url: '',
        attempts: 0,
        latencyMs: 0,
      };
    }

    return {
      state,
      checkedAt,
      error: shortString(data.error, 240),
      url: shortString(data.url, 120),
      attempts: positiveInteger(data.attempts),
      latencyMs: positiveInteger(data.latencyMs),
    };
  } catch {
    return null;
  }
}
