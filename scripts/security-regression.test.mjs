import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vidium-security-test-'));

Object.assign(process.env, {
  PORT: '3000',
  HOST: '127.0.0.1',
  DB_PATH: join(temporaryDirectory, 'vidium.db'),
  MEDIA_DIR: join(temporaryDirectory, 'media'),
  DISK_HIGH_WATERMARK: '0.8',
  DISK_LOW_WATERMARK: '0.6',
  CRAWL_INITIAL: '1',
  INVITE_CODE: 'test-secret-that-is-not-a-default',
  SESSION_MAX_AGE: '60000',
  DEFAULT_LANG: 'en',
});

const { db } = await import('../src/lib/db.ts');
const { getTrustedClientIp } = await import('../src/lib/client-ip.ts');
const { isValidRegistrationCredentials } = await import('../src/lib/auth/auth.ts');
const {
  checkRegistrationRateLimit,
  isLoginRateLimited,
  recordLoginFailure,
  resetLoginRateLimit,
} = await import('../src/lib/auth/ratelimit.ts');
const { getPlayCountByUid, recordPlayEvent } = await import('../src/lib/play-stats.ts');
const { resetStale } = await import('../src/lib/queue.ts');

test('only local nginx may supply X-Real-IP', () => {
  const proxied = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-real-ip': '203.0.113.10', 'x-forwarded-for': '198.51.100.5' },
  };
  const direct = {
    socket: { remoteAddress: '198.51.100.7' },
    headers: { 'x-real-ip': '203.0.113.11' },
  };
  const forwardedOnly = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '203.0.113.12' },
  };

  assert.equal(getTrustedClientIp(proxied), '203.0.113.10');
  assert.equal(getTrustedClientIp(direct), '198.51.100.7');
  assert.equal(getTrustedClientIp(forwardedOnly), '127.0.0.1');
});

test('login limiter counts failures by IP and resets after success', () => {
  const ip = '203.0.113.20';
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(isLoginRateLimited(ip), false);
    recordLoginFailure(ip);
  }
  assert.equal(isLoginRateLimited(ip), true);
  resetLoginRateLimit(ip);
  assert.equal(isLoginRateLimited(ip), false);
});

test('registration limiter allows five posts per IP in a window', () => {
  const ip = '203.0.113.21';
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(checkRegistrationRateLimit(ip), true);
  }
  assert.equal(checkRegistrationRateLimit(ip), false);
});

test('registration credentials enforce the agreed bounds', () => {
  assert.equal(isValidRegistrationCredentials('abc', '123456789012'), true);
  assert.equal(isValidRegistrationCredentials(' ab', '123456789012'), false);
  assert.equal(isValidRegistrationCredentials('ab', '123456789012'), false);
  assert.equal(isValidRegistrationCredentials('abc', 'too-short'), false);
});

test('play counts are aggregated, deduplicated, and actor-limited', () => {
  db.prepare("INSERT INTO channels (id, name, url) VALUES (2, 'test', 'test-url')").run();
  db.prepare(`
    INSERT INTO videos (channel_id, uid, youtube_id, title, date)
    VALUES (2, 'testuid123456789', 'abcdefghijk', 'Test', '2026-01-01')
  `).run();

  const actor = 'guest:203.0.113.22';
  assert.equal(recordPlayEvent('testuid123456789', 'video', actor), 'recorded');
  assert.equal(recordPlayEvent('testuid123456789', 'video', actor), 'deduplicated');
  assert.equal(recordPlayEvent('testuid123456789', 'video', 'user:1'), 'recorded');
  assert.equal(getPlayCountByUid('testuid123456789', 'video'), 2);

  for (let attempt = 2; attempt < 30; attempt++) {
    assert.equal(recordPlayEvent('testuid123456789', 'video', actor), 'deduplicated');
  }
  assert.equal(recordPlayEvent('testuid123456789', 'video', actor), 'rate_limited');

  const rows = db.prepare('SELECT COUNT(*) AS count FROM video_play_counts').get();
  assert.equal(rows.count, 1);
});

test('recovering an interrupted job does not consume a retry', () => {
  db.prepare(`
    INSERT INTO jobs (type, status, attempts, payload)
    VALUES ('download_thumbnail', 'processing', 2, '{}')
  `).run();
  resetStale();
  const row = db.prepare(`
    SELECT status, attempts FROM jobs ORDER BY id DESC LIMIT 1
  `).get();
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 1);
});

test.after(async () => {
  db.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});
