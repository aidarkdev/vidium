import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vidium-config-test-'));
const configModuleUrl = pathToFileURL(join(import.meta.dirname, '..', '..', 'src/config.ts')).href;
const proxyCheckUrl = pathToFileURL(join(import.meta.dirname, '..', 'check-proxy-status.ts')).href;
const proxyStatusModuleUrl = pathToFileURL(
  join(import.meta.dirname, '..', '..', 'src/lib/proxy-status.ts'),
).href;

function validEnv(overrides = {}, removedKeys = []) {
  const env = {
    ...process.env,
    PORT: '3000',
    HOST: '127.0.0.1',
    DB_PATH: join(temporaryDirectory, 'vidium.db'),
    MEDIA_DIR: join(temporaryDirectory, 'media'),
    DISK_HIGH_WATERMARK: '0.8',
    DISK_LOW_WATERMARK: '0.6',
    YTDLP_PROXY: '',
    PROXY_STATUS_PATH: join(temporaryDirectory, 'proxy-status.json'),
    YTDLP_COOKIES: '',
    CRAWL_INITIAL: '15',
    INVITE_CODE: 'test-secret-that-is-not-a-default',
    SESSION_MAX_AGE: '604800000',
    DEFAULT_LANG: 'ru',
    DOMAIN: 'legacy-value-is-ignored',
    YTDLP_SLEEP: 'legacy-value-is-ignored',
    ...overrides,
  };

  for (const key of removedKeys) delete env[key];
  return env;
}

async function loadConfig(env) {
  return run(process.execPath, ['-e', `await import('${configModuleUrl}')`], { env });
}

async function assertConfigFails(overrides, expectedError, removedKeys = []) {
  try {
    await loadConfig(validEnv(overrides, removedKeys));
    assert.fail('configuration unexpectedly loaded');
  } catch (error) {
    assert.match(error.stderr, expectedError);
  }
}

test('valid config loads and ignores removed legacy keys', async () => {
  await loadConfig(validEnv());
});

test('config rejects missing, malformed, and unsupported values', async () => {
  await assertConfigFails({}, /DB_PATH is not set in \.env/, ['DB_PATH']);
  await assertConfigFails({ PORT: '3000junk' }, /PORT must be a finite number/);
  await assertConfigFails({ PORT: '3001' }, /PORT must be 3000/);
  await assertConfigFails({ HOST: '0.0.0.0' }, /HOST must be 127\.0\.0\.1/);
  await assertConfigFails({ CRAWL_INITIAL: '1.5' }, /CRAWL_INITIAL must be an integer/);
  await assertConfigFails({ SESSION_MAX_AGE: '-1' }, /SESSION_MAX_AGE must be a positive integer/);
  await assertConfigFails({ DEFAULT_LANG: 'de' }, /DEFAULT_LANG must be one of: en, ru/);
});

test('config enforces disk watermark bounds and ordering', async () => {
  const expected = /0 <= DISK_LOW_WATERMARK < DISK_HIGH_WATERMARK <= 1/;
  await assertConfigFails({ DISK_LOW_WATERMARK: '-0.1' }, expected);
  await assertConfigFails({ DISK_HIGH_WATERMARK: '1.1' }, expected);
  await assertConfigFails({ DISK_LOW_WATERMARK: '0.8', DISK_HIGH_WATERMARK: '0.8' }, expected);
});

test('proxy requires a status path before any network check', async () => {
  const env = validEnv({ YTDLP_PROXY: 'socks5://127.0.0.1:1080', PROXY_STATUS_PATH: '' });
  await assertConfigFails(
    { YTDLP_PROXY: env.YTDLP_PROXY, PROXY_STATUS_PATH: '' },
    /PROXY_STATUS_PATH must be set when YTDLP_PROXY is configured/,
  );

  try {
    await run(process.execPath, ['-e', `await import('${proxyCheckUrl}')`], { env });
    assert.fail('proxy check unexpectedly accepted a missing status path');
  } catch (error) {
    assert.match(error.stderr, /PROXY_STATUS_PATH must be set when YTDLP_PROXY is configured/);
  }
});

test('disabled proxy check is a no-op and hides stale status', async () => {
  const statusPath = join(temporaryDirectory, 'stale-proxy-status.json');
  await writeFile(
    statusPath,
    JSON.stringify({
      ok: true,
      checkedAt: '2026-01-01T00:00:00.000Z',
      error: '',
      url: 'https://example.com',
      attempts: 1,
      latencyMs: 1,
    }),
  );
  const env = validEnv({ YTDLP_PROXY: '', PROXY_STATUS_PATH: statusPath });

  await run(process.execPath, ['-e', `await import('${proxyCheckUrl}')`], { env });
  await run(
    process.execPath,
    [
      '-e',
      `const { readProxyStatus } = await import('${proxyStatusModuleUrl}'); if (readProxyStatus() !== null) process.exit(1)`,
    ],
    { env },
  );
});

test.after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});
