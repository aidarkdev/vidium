/**
 * Checks the configured yt-dlp SOCKS proxy and writes the result for /admin.
 *
 * Usage:
 *   node --env-file=.env scripts/check-proxy-status.ts
 */

import { spawn } from 'node:child_process';
import { renameSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const CHECK_URL = 'https://www.google.com/generate_204';
const TIMEOUT_SECONDS = '20';
const ATTEMPTS = 3;
const MAX_ERROR_LENGTH = 240;

interface CheckResult {
  ok: boolean;
  checkedAt: string;
  error: string;
  url: string;
  attempts: number;
  latencyMs: number;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
}

function runCurl(proxy: string): Promise<{ body: string; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const proc = spawn('curl', [
      '--silent',
      '--show-error',
      '--fail',
      '--max-time',
      TIMEOUT_SECONDS,
      '--proxy',
      proxy,
      CHECK_URL,
    ]);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    proc.stdout.on('data', (chunk) => stdout.push(chunk));
    proc.stderr.on('data', (chunk) => stderr.push(chunk));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          body: Buffer.concat(stdout).toString('utf8'),
          latencyMs: Date.now() - startedAt,
        });
        return;
      }

      const err = Buffer.concat(stderr).toString('utf8') || `curl exited with code ${code}`;
      reject(new Error(err));
    });
  });
}

async function checkProxy(proxy: string): Promise<CheckResult> {
  const checkedAt = new Date().toISOString();
  let lastError = '';

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const result = await runCurl(proxy);
      return {
        ok: true,
        checkedAt,
        error: '',
        url: CHECK_URL,
        attempts: attempt,
        latencyMs: result.latencyMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: false,
    checkedAt,
    error: truncate(lastError, MAX_ERROR_LENGTH),
    url: CHECK_URL,
    attempts: ATTEMPTS,
    latencyMs: 0,
  };
}

async function writeStatus(path: string, result: CheckResult): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const tmpPath = `${path}.tmp`;
  const json = `${JSON.stringify(result, null, 2)}\n`;
  await writeFile(tmpPath, json);
  renameSync(tmpPath, path);
}

async function main(): Promise<void> {
  const proxy = process.env.YTDLP_PROXY ?? '';
  const statusPath = process.env.PROXY_STATUS_PATH ?? '';

  if (!proxy) return;
  if (!statusPath) {
    throw new Error('PROXY_STATUS_PATH must be set when YTDLP_PROXY is configured');
  }

  await writeStatus(statusPath, await checkProxy(proxy));
}

await main();
