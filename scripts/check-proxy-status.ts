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

const CHECK_URL = 'https://ifconfig.me';
const TIMEOUT_SECONDS = '10';
const MAX_ERROR_LENGTH = 240;

interface CheckResult {
  ok: boolean;
  checkedAt: string;
  error: string;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
}

function runCurl(proxy: string): Promise<string> {
  return new Promise((resolve, reject) => {
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
        resolve(Buffer.concat(stdout).toString('utf8'));
        return;
      }

      const err = Buffer.concat(stderr).toString('utf8') || `curl exited with code ${code}`;
      reject(new Error(err));
    });
  });
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

  if (!proxy || !statusPath) return;

  const checkedAt = new Date().toISOString();

  try {
    await runCurl(proxy);
    await writeStatus(statusPath, { ok: true, checkedAt, error: '' });
  } catch (err) {
    await writeStatus(statusPath, {
      ok: false,
      checkedAt,
      error: truncate(err instanceof Error ? err.message : String(err), MAX_ERROR_LENGTH),
    });
  }
}

await main();
