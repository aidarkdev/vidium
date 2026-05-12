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

export function readProxyStatus(): ProxyStatus | null {
  const path = config.PROXY_STATUS_PATH;
  if (!path) return null;

  try {
    if (statSync(path).size > 4096) {
      return { state: 'invalid', checkedAt: '', error: 'proxy status file is too large' };
    }

    const raw = readFileSync(path, 'utf8');
    const data = asRecord(JSON.parse(raw));
    if (!data) return { state: 'invalid', checkedAt: '', error: 'proxy status JSON is invalid' };

    const checkedAt = shortString(data.checkedAt, 64);
    if (!checkedAt) {
      return { state: 'invalid', checkedAt: '', error: 'proxy status checkedAt is missing' };
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
      return { state: 'invalid', checkedAt, error: 'proxy status state is invalid' };
    }

    return {
      state,
      checkedAt,
      error: shortString(data.error, 240),
    };
  } catch {
    return null;
  }
}
