import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vidium-worker-queue-test-'));

Object.assign(process.env, {
  PORT: '3000',
  HOST: '127.0.0.1',
  DB_PATH: join(temporaryDirectory, 'vidium.db'),
  MEDIA_DIR: join(temporaryDirectory, 'media'),
  DISK_HIGH_WATERMARK: '0.8',
  DISK_LOW_WATERMARK: '0.6',
  YTDLP_PROXY: '',
  PROXY_STATUS_PATH: '',
  YTDLP_COOKIES: '',
  CRAWL_INITIAL: '5',
  INVITE_CODE: 'worker-queue-test-secret',
  SESSION_MAX_AGE: '60000',
  DEFAULT_LANG: 'en',
  ASSET_MANIFEST_PATH: join(temporaryDirectory, 'missing-asset-manifest.json'),
});

const { db } = await import('../../src/lib/db.ts');
const {
  enqueue,
  take,
  complete,
  fail,
  resetStale,
  getRecentJobs,
  getJobAdminById,
  deleteJobById,
  deleteJobsByYoutubeId,
  deleteDownloadJobsByYoutubeId,
} = await import('../../src/lib/queue.ts');
const { getRssChannels } = await import('../../src/lib/channel.ts');

function jobs() {
  return db
    .prepare('SELECT id, type, payload, status, attempts, error FROM jobs ORDER BY id')
    .all();
}

function insertRawJob({
  type = 'download_video',
  payload = '{}',
  status = 'pending',
  attempts = 0,
  error = null,
}) {
  const result = db
    .prepare('INSERT INTO jobs (type, payload, status, attempts, error) VALUES (?, ?, ?, ?, ?)')
    .run(type, payload, status, attempts, error);
  return Number(result.lastInsertRowid);
}

test.beforeEach(() => {
  db.exec(`
    DELETE FROM jobs;
    DELETE FROM channels WHERE id != 1;
    DELETE FROM sqlite_sequence WHERE name IN ('jobs', 'channels');
  `);
});

test('queue takes enqueued jobs in FIFO order, including equal timestamps', () => {
  enqueue('download_video', { youtubeId: 'first000001' });
  enqueue('download_audio', { youtubeId: 'second00001' });
  enqueue('download_thumbnail', { youtubeId: 'third000001' });
  db.prepare("UPDATE jobs SET created_at = '2026-08-16T00:00:00Z'").run();

  assert.deepEqual(
    [take(), take(), take()].map((job) => ({ type: job.type, payload: JSON.parse(job.payload) })),
    [
      { type: 'download_video', payload: { youtubeId: 'first000001' } },
      { type: 'download_audio', payload: { youtubeId: 'second00001' } },
      { type: 'download_thumbnail', payload: { youtubeId: 'third000001' } },
    ],
  );
  assert.equal(take(), undefined);
});

test('take atomically marks the returned job processing and increments attempts', () => {
  enqueue('download_video', { youtubeId: 'atomic00001' });

  const job = take();
  assert.ok(job);
  assert.deepEqual(
    { ...db.prepare('SELECT status, attempts FROM jobs WHERE id = ?').get(job.id) },
    { status: 'processing', attempts: 1 },
  );
});

test('complete marks a processing job done', () => {
  enqueue('download_audio', { youtubeId: 'complete001' });
  const job = take();
  assert.ok(job);

  complete(job.id);

  assert.deepEqual(
    { ...db.prepare('SELECT status, attempts FROM jobs WHERE id = ?').get(job.id) },
    {
      status: 'done',
      attempts: 1,
    },
  );
});

test('fail retries twice with the latest error and fails on the third attempt', () => {
  enqueue('download_video', { youtubeId: 'retry000001' });

  const first = take();
  assert.ok(first);
  fail(first.id, 'first error');
  assert.deepEqual(
    { ...db.prepare('SELECT status, attempts, error FROM jobs WHERE id = ?').get(first.id) },
    {
      status: 'pending',
      attempts: 1,
      error: 'first error',
    },
  );

  const second = take();
  assert.ok(second);
  fail(second.id, 'second error');
  assert.deepEqual(
    { ...db.prepare('SELECT status, attempts, error FROM jobs WHERE id = ?').get(second.id) },
    { status: 'pending', attempts: 2, error: 'second error' },
  );

  const third = take();
  assert.ok(third);
  fail(third.id, 'third error');
  assert.deepEqual(
    { ...db.prepare('SELECT status, attempts, error FROM jobs WHERE id = ?').get(third.id) },
    {
      status: 'failed',
      attempts: 3,
      error: 'third error',
    },
  );
});

test('resetStale resets only processing jobs and rolls back one interrupted attempt', () => {
  const interrupted = insertRawJob({ status: 'processing', attempts: 3 });
  const interruptedAtZero = insertRawJob({ status: 'processing', attempts: 0 });
  const pending = insertRawJob({ status: 'pending', attempts: 2 });
  const done = insertRawJob({ status: 'done', attempts: 2 });
  const failed = insertRawJob({ status: 'failed', attempts: 3 });

  resetStale();

  assert.deepEqual(
    db
      .prepare('SELECT id, status, attempts FROM jobs ORDER BY id')
      .all()
      .map((row) => ({ ...row })),
    [
      { id: interrupted, status: 'pending', attempts: 2 },
      { id: interruptedAtZero, status: 'pending', attempts: 0 },
      { id: pending, status: 'pending', attempts: 2 },
      { id: done, status: 'done', attempts: 2 },
      { id: failed, status: 'failed', attempts: 3 },
    ],
  );
});

test('deleteJobById removes only the requested job', () => {
  const target = insertRawJob({ payload: JSON.stringify({ youtubeId: 'target00001' }) });
  const other = insertRawJob({ payload: JSON.stringify({ youtubeId: 'other000001' }) });

  assert.equal(deleteJobById(target), true);
  assert.equal(deleteJobById(target), false);
  assert.deepEqual(
    jobs().map((job) => job.id),
    [other],
  );
});

test('deleteJobsByYoutubeId removes every target type and ignores other or malformed payloads', () => {
  const target = 'target00001';
  for (const type of ['download_video', 'download_audio', 'download_thumbnail', 'crawl_channel']) {
    insertRawJob({ type, payload: JSON.stringify({ youtubeId: target }) });
  }
  const other = insertRawJob({ payload: JSON.stringify({ youtubeId: 'other000001' }) });
  const malformed = insertRawJob({ payload: '{malformed' });

  assert.equal(deleteJobsByYoutubeId(target), 4);
  assert.deepEqual(
    jobs().map((job) => job.id),
    [other, malformed],
  );
});

test('deleteDownloadJobsByYoutubeId removes only target video and audio jobs', () => {
  const target = 'target00001';
  insertRawJob({ type: 'download_video', payload: JSON.stringify({ youtubeId: target }) });
  insertRawJob({ type: 'download_audio', payload: JSON.stringify({ youtubeId: target }) });
  const thumbnail = insertRawJob({
    type: 'download_thumbnail',
    payload: JSON.stringify({ youtubeId: target }),
  });
  const crawl = insertRawJob({
    type: 'crawl_channel',
    payload: JSON.stringify({ youtubeId: target }),
  });
  const other = insertRawJob({ payload: JSON.stringify({ youtubeId: 'other000001' }) });
  const malformed = insertRawJob({ payload: '{malformed' });

  assert.equal(deleteDownloadJobsByYoutubeId(target), 2);
  assert.deepEqual(
    jobs().map((job) => job.id),
    [thumbnail, crawl, other, malformed],
  );
});

test('admin queue listing tolerates malformed JSON payloads', () => {
  const malformed = insertRawJob({
    type: 'download_thumbnail',
    payload: '{malformed',
    status: 'failed',
    attempts: 3,
    error: 'bad payload',
  });
  insertRawJob({ payload: JSON.stringify({ youtubeId: 'valid000001' }) });

  assert.deepEqual(getJobAdminById(malformed), {
    id: malformed,
    type: 'download_thumbnail',
    status: 'failed',
    attempts: 3,
    youtubeId: '',
    error: 'bad payload',
    createdAt: getJobAdminById(malformed).createdAt,
  });
  assert.deepEqual(
    getRecentJobs().map((job) => job.youtubeId),
    ['valid000001', ''],
  );
});

test('SQLite RSS selection returns only enabled channels with a YouTube channel id', () => {
  db.prepare(
    `INSERT INTO channels (name, url, youtube_channel_id, rss_enabled)
     VALUES (?, ?, ?, ?)`,
  ).run('enabled', 'https://example.test/enabled', 'UC_ENABLED', 1);
  db.prepare(
    `INSERT INTO channels (name, url, youtube_channel_id, rss_enabled)
     VALUES (?, ?, ?, ?)`,
  ).run('disabled', 'https://example.test/disabled', 'UC_DISABLED', 0);
  db.prepare(
    `INSERT INTO channels (name, url, youtube_channel_id, rss_enabled)
     VALUES (?, ?, ?, ?)`,
  ).run('missing-id', 'https://example.test/missing', '', 1);

  assert.deepEqual(
    getRssChannels().map((channel) => channel.youtubeChannelId),
    ['UC_ENABLED'],
  );
});

test.after(async () => {
  db.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});
