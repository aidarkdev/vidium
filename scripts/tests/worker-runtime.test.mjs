import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vidium-worker-runtime-test-'));

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
  INVITE_CODE: 'worker-runtime-test-secret',
  SESSION_MAX_AGE: '60000',
  DEFAULT_LANG: 'en',
  ASSET_MANIFEST_PATH: join(temporaryDirectory, 'missing-asset-manifest.json'),
});

const { db } = await import('../../src/lib/db.ts');
const { createWorkerRuntime } = await import('../../src/worker.ts');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function job(id, type, payload) {
  return { id, type, payload: typeof payload === 'string' ? payload : JSON.stringify(payload) };
}

function createFakeDependencies(overrides = {}) {
  const queue = [];
  const intervals = [];
  const calls = {
    take: 0,
    complete: [],
    fail: [],
    resetStale: 0,
    enqueue: [],
    downloadVideo: [],
    downloadAudio: [],
    downloadThumb: [],
    crawlChannel: [],
    fetchChapters: [],
    fetchFeed: [],
    checkDisk: 0,
    purgeExpired: 0,
    videoStatus: [],
    audioStatus: [],
    duration: [],
    insertVideos: [],
    chapters: [],
    getChannelById: [],
    updateChannelYoutubeId: [],
    updateLastCrawled: [],
    sleep: [],
    log: [],
    error: [],
    fatal: [],
  };

  const dependencies = {
    mediaDir: '/test-media',
    crawlInitial: 9,
    enqueue(type, payload) {
      calls.enqueue.push({ type, payload });
    },
    take() {
      calls.take++;
      return queue.shift();
    },
    complete(id) {
      calls.complete.push(id);
    },
    fail(id, error) {
      calls.fail.push({ id, error });
    },
    resetStale() {
      calls.resetStale++;
    },
    async downloadVideo(youtubeId, destDir) {
      calls.downloadVideo.push({ youtubeId, destDir });
      return 0;
    },
    async downloadAudio(youtubeId, destDir) {
      calls.downloadAudio.push({ youtubeId, destDir });
      return 0;
    },
    async downloadThumb(youtubeId, destDir) {
      calls.downloadThumb.push({ youtubeId, destDir });
    },
    async crawlChannel(url, start, end) {
      calls.crawlChannel.push({ url, start, end });
      return { channelYoutubeId: '', entries: [] };
    },
    async fetchChapters(youtubeId) {
      calls.fetchChapters.push(youtubeId);
      return [];
    },
    async fetchFeed(youtubeChannelId) {
      calls.fetchFeed.push(youtubeChannelId);
      return [];
    },
    existsSync() {
      return false;
    },
    async checkDisk() {
      calls.checkDisk++;
    },
    purgeExpired() {
      calls.purgeExpired++;
    },
    setVideoStatus(youtubeId, status) {
      calls.videoStatus.push({ youtubeId, status });
    },
    setAudioStatus(youtubeId, status) {
      calls.audioStatus.push({ youtubeId, status });
    },
    setDurationIfZero(youtubeId, duration) {
      calls.duration.push({ youtubeId, duration });
    },
    insertVideos(entries, channelId, sourceType) {
      calls.insertVideos.push({ entries, channelId, sourceType });
      return entries.map((entry) => entry.youtubeId);
    },
    setVideoChapters(youtubeId, chapters) {
      calls.chapters.push({ youtubeId, chapters });
    },
    getChannelById(channelId) {
      calls.getChannelById.push(channelId);
      return undefined;
    },
    getRssChannels() {
      return [];
    },
    updateChannelYoutubeId(channelId, youtubeChannelId) {
      calls.updateChannelYoutubeId.push({ channelId, youtubeChannelId });
    },
    updateLastCrawled(channelId) {
      calls.updateLastCrawled.push(channelId);
    },
    setInterval(handler, timeout) {
      const timer = { id: intervals.length + 1, handler, timeout, cleared: false };
      intervals.push(timer);
      return timer.id;
    },
    clearInterval(id) {
      const timer = intervals.find((candidate) => candidate.id === id);
      if (timer) timer.cleared = true;
    },
    async sleep(ms) {
      calls.sleep.push(ms);
    },
    log(...args) {
      calls.log.push(args);
    },
    error(...args) {
      calls.error.push(args);
    },
    fatal(error) {
      calls.fatal.push(error);
    },
    ...overrides,
  };

  return { dependencies, queue, intervals, calls };
}

test('video success transitions downloading to ready, persists positive duration and chapters', async () => {
  const download = deferred();
  const chapters = [{ title: 'Intro', start: 0, end: 15 }];
  const fake = createFakeDependencies({
    downloadVideo(youtubeId, destDir) {
      fake.calls.downloadVideo.push({ youtubeId, destDir });
      return download.promise;
    },
    async fetchChapters(youtubeId) {
      fake.calls.fetchChapters.push(youtubeId);
      return chapters;
    },
  });
  fake.queue.push(job(1, 'download_video', { youtubeId: 'video000001' }));
  const runtime = createWorkerRuntime(fake.dependencies);

  const processing = runtime.runNextJob();
  assert.deepEqual(fake.calls.videoStatus, [{ youtubeId: 'video000001', status: 'downloading' }]);
  assert.deepEqual(fake.calls.complete, []);

  download.resolve(321);
  await processing;

  assert.deepEqual(fake.calls.videoStatus, [
    { youtubeId: 'video000001', status: 'downloading' },
    { youtubeId: 'video000001', status: 'ready' },
  ]);
  assert.deepEqual(fake.calls.duration, [{ youtubeId: 'video000001', duration: 321 }]);
  assert.deepEqual(fake.calls.chapters, [{ youtubeId: 'video000001', chapters }]);
  assert.deepEqual(fake.calls.complete, [1]);
  assert.deepEqual(fake.calls.fail, []);
});

test('audio success transitions downloading to ready and ignores a non-positive duration', async () => {
  const chapters = [{ title: 'Part', start: 10, end: 20 }];
  const fake = createFakeDependencies({
    async downloadAudio(youtubeId, destDir) {
      fake.calls.downloadAudio.push({ youtubeId, destDir });
      return 0;
    },
    async fetchChapters(youtubeId) {
      fake.calls.fetchChapters.push(youtubeId);
      return chapters;
    },
  });
  fake.queue.push(job(2, 'download_audio', { youtubeId: 'audio000001' }));

  await createWorkerRuntime(fake.dependencies).runNextJob();

  assert.deepEqual(fake.calls.audioStatus, [
    { youtubeId: 'audio000001', status: 'downloading' },
    { youtubeId: 'audio000001', status: 'ready' },
  ]);
  assert.deepEqual(fake.calls.duration, []);
  assert.deepEqual(fake.calls.chapters, [{ youtubeId: 'audio000001', chapters }]);
  assert.deepEqual(fake.calls.complete, [2]);
});

for (const kind of ['video', 'audio']) {
  test(`${kind} failure resets its status and reaches queue fail`, async () => {
    const type = `download_${kind}`;
    const fake = createFakeDependencies({
      async downloadVideo() {
        throw new Error('download failed');
      },
      async downloadAudio() {
        throw new Error('download failed');
      },
    });
    fake.queue.push(job(3, type, { youtubeId: `${kind}fail01` }));

    await createWorkerRuntime(fake.dependencies).runNextJob();

    const statusCalls = kind === 'video' ? fake.calls.videoStatus : fake.calls.audioStatus;
    assert.deepEqual(statusCalls, [
      { youtubeId: `${kind}fail01`, status: 'downloading' },
      { youtubeId: `${kind}fail01`, status: 'none' },
    ]);
    assert.deepEqual(fake.calls.fail, [{ id: 3, error: 'download failed' }]);
    assert.deepEqual(fake.calls.complete, []);
  });
}

test('chapter failure does not cancel a successful media download', async () => {
  const fake = createFakeDependencies({
    async downloadVideo() {
      return 42;
    },
    async fetchChapters() {
      throw new Error('chapters unavailable');
    },
  });
  fake.queue.push(job(4, 'download_video', { youtubeId: 'chapterfail1' }));

  await createWorkerRuntime(fake.dependencies).runNextJob();

  assert.deepEqual(fake.calls.videoStatus, [
    { youtubeId: 'chapterfail1', status: 'downloading' },
    { youtubeId: 'chapterfail1', status: 'ready' },
  ]);
  assert.deepEqual(fake.calls.complete, [4]);
  assert.deepEqual(fake.calls.fail, []);
  assert.match(String(fake.calls.error[0][0]), /chapter fetch failed/);
});

test('thumbnail jobs skip existing files and download missing files', async () => {
  const fake = createFakeDependencies({
    existsSync(path) {
      return path.endsWith('/existing001.jpg');
    },
  });
  fake.queue.push(job(5, 'download_thumbnail', { youtubeId: 'existing001' }));
  fake.queue.push(job(6, 'download_thumbnail', { youtubeId: 'missing0001' }));
  const runtime = createWorkerRuntime(fake.dependencies);

  await runtime.runNextJob();
  await runtime.runNextJob();

  assert.deepEqual(fake.calls.downloadThumb, [
    { youtubeId: 'missing0001', destDir: '/test-media/thumbs' },
  ]);
  assert.deepEqual(fake.calls.complete, [5, 6]);
});

test('crawl inserts new videos and creates thumbnail and enabled auto-download jobs', async () => {
  const entries = [
    { youtubeId: 'newvideo001', title: 'New', date: '2026-08-16', duration: 10 },
    { youtubeId: 'knownvideo1', title: 'Known', date: '2026-08-15', duration: 20 },
  ];
  const fake = createFakeDependencies({
    async crawlChannel(url, start, end) {
      fake.calls.crawlChannel.push({ url, start, end });
      return { channelYoutubeId: 'UC_NEW_ID', entries };
    },
    insertVideos(receivedEntries, channelId, sourceType) {
      fake.calls.insertVideos.push({ entries: receivedEntries, channelId, sourceType });
      return ['newvideo001'];
    },
    getChannelById(channelId) {
      fake.calls.getChannelById.push(channelId);
      return { autoDownloadVideo: true, autoDownloadAudio: true };
    },
  });
  fake.queue.push(job(7, 'crawl_channel', { channelId: 17, url: 'https://youtube.test/channel' }));

  await createWorkerRuntime(fake.dependencies).runNextJob();

  assert.deepEqual(fake.calls.crawlChannel, [
    { url: 'https://youtube.test/channel', start: 1, end: 9 },
  ]);
  assert.deepEqual(fake.calls.insertVideos, [{ entries, channelId: 17, sourceType: 'channel' }]);
  assert.deepEqual(fake.calls.enqueue, [
    { type: 'download_thumbnail', payload: { youtubeId: 'newvideo001' } },
    { type: 'download_video', payload: { youtubeId: 'newvideo001' } },
    { type: 'download_audio', payload: { youtubeId: 'newvideo001' } },
  ]);
  assert.deepEqual(fake.calls.videoStatus, [{ youtubeId: 'newvideo001', status: 'queued' }]);
  assert.deepEqual(fake.calls.audioStatus, [{ youtubeId: 'newvideo001', status: 'queued' }]);
  assert.deepEqual(fake.calls.updateChannelYoutubeId, [
    { channelId: 17, youtubeChannelId: 'UC_NEW_ID' },
  ]);
  assert.deepEqual(fake.calls.complete, [7]);
});

test('malformed JSON fails its job and the running drain continues instead of crashing', async () => {
  const fake = createFakeDependencies();
  fake.queue.push(job(8, 'download_video', '{malformed'));
  const runtime = createWorkerRuntime(fake.dependencies);

  runtime.start();
  await flushPromises();

  assert.equal(fake.calls.fail.length, 1);
  assert.equal(fake.calls.fail[0].id, 8);
  assert.match(fake.calls.fail[0].error, /JSON/);
  assert.deepEqual(fake.calls.complete, []);
  assert.equal(fake.calls.fatal.length, 0);
  assert.equal(fake.calls.take, 2);
  await runtime.stop('test');
});

test('RSS continues after one channel fails and mutates data only for successful fetches', async () => {
  const entriesByChannel = {
    UC_ONE: [{ youtubeId: 'rssvideo001', title: 'One', date: '2026-08-16' }],
    UC_THREE: [{ youtubeId: 'rssaudio001', title: 'Three', date: '2026-08-16' }],
  };
  const fake = createFakeDependencies({
    getRssChannels() {
      return [
        {
          id: 1,
          youtubeChannelId: 'UC_ONE',
          autoDownloadVideo: true,
          autoDownloadAudio: false,
        },
        {
          id: 2,
          youtubeChannelId: 'UC_FAIL',
          autoDownloadVideo: true,
          autoDownloadAudio: true,
        },
        {
          id: 3,
          youtubeChannelId: 'UC_THREE',
          autoDownloadVideo: false,
          autoDownloadAudio: true,
        },
      ];
    },
    async fetchFeed(youtubeChannelId) {
      fake.calls.fetchFeed.push(youtubeChannelId);
      if (youtubeChannelId === 'UC_FAIL') throw new Error('feed failed');
      return entriesByChannel[youtubeChannelId];
    },
  });

  await createWorkerRuntime(fake.dependencies).startRssPoll();

  assert.deepEqual(fake.calls.fetchFeed, ['UC_ONE', 'UC_FAIL', 'UC_THREE']);
  assert.deepEqual(
    fake.calls.insertVideos.map(({ channelId }) => channelId),
    [1, 3],
  );
  assert.deepEqual(fake.calls.updateLastCrawled, [1, 3]);
  assert.deepEqual(fake.calls.enqueue, [
    { type: 'download_thumbnail', payload: { youtubeId: 'rssvideo001' } },
    { type: 'download_video', payload: { youtubeId: 'rssvideo001' } },
    { type: 'download_thumbnail', payload: { youtubeId: 'rssaudio001' } },
    { type: 'download_audio', payload: { youtubeId: 'rssaudio001' } },
  ]);
  assert.equal(fake.calls.error.length, 1);
});

test('parallel RSS poll requests share one active promise', async () => {
  const feed = deferred();
  const fake = createFakeDependencies({
    getRssChannels() {
      return [
        {
          id: 1,
          youtubeChannelId: 'UC_ONE',
          autoDownloadVideo: false,
          autoDownloadAudio: false,
        },
      ];
    },
    fetchFeed(youtubeChannelId) {
      fake.calls.fetchFeed.push(youtubeChannelId);
      return feed.promise;
    },
  });
  const runtime = createWorkerRuntime(fake.dependencies);

  const first = runtime.startRssPoll();
  const second = runtime.startRssPoll();

  assert.equal(first, second);
  assert.deepEqual(fake.calls.fetchFeed, ['UC_ONE']);
  feed.resolve([]);
  await first;
});

test('stop between RSS channels prevents the next channel from starting', async () => {
  const betweenChannels = deferred();
  const fake = createFakeDependencies({
    getRssChannels() {
      return [
        {
          id: 1,
          youtubeChannelId: 'UC_ONE',
          autoDownloadVideo: false,
          autoDownloadAudio: false,
        },
        {
          id: 2,
          youtubeChannelId: 'UC_TWO',
          autoDownloadVideo: false,
          autoDownloadAudio: false,
        },
      ];
    },
    sleep(ms) {
      fake.calls.sleep.push(ms);
      return betweenChannels.promise;
    },
  });
  const runtime = createWorkerRuntime(fake.dependencies);
  const poll = runtime.startRssPoll();
  await flushPromises();
  assert.deepEqual(fake.calls.fetchFeed, ['UC_ONE']);

  const stopping = runtime.stop('test');
  betweenChannels.resolve();
  await stopping;
  await poll;

  assert.deepEqual(fake.calls.fetchFeed, ['UC_ONE']);
});

test('start is idempotent, resets stale jobs once and installs each lifecycle timer once', async () => {
  const feed = deferred();
  const fake = createFakeDependencies({
    getRssChannels() {
      return [
        {
          id: 1,
          youtubeChannelId: 'UC_ONE',
          autoDownloadVideo: false,
          autoDownloadAudio: false,
        },
      ];
    },
    fetchFeed(youtubeChannelId) {
      fake.calls.fetchFeed.push(youtubeChannelId);
      return feed.promise;
    },
  });
  const runtime = createWorkerRuntime(fake.dependencies);

  runtime.start();
  runtime.start();
  runtime.startRssPoll();

  assert.equal(fake.calls.resetStale, 1);
  assert.deepEqual(
    fake.intervals.map((timer) => timer.timeout),
    [2000, 30 * 60 * 1000, 5 * 60 * 1000, 60 * 60 * 1000],
  );
  assert.deepEqual(fake.calls.fetchFeed, ['UC_ONE']);
  feed.resolve([]);
  await runtime.stop('test');
});

test('disk and session timers perform only their corresponding maintenance work', async () => {
  const fake = createFakeDependencies({
    async checkDisk(onDeleted) {
      fake.calls.checkDisk++;
      onDeleted({ youtubeId: 'diskvideo01', type: 'video' });
      onDeleted({ youtubeId: 'diskaudio01', type: 'audio' });
    },
  });
  const runtime = createWorkerRuntime(fake.dependencies);
  runtime.start();
  await flushPromises();

  fake.intervals.find((timer) => timer.timeout === 5 * 60 * 1000).handler();
  await flushPromises();
  assert.deepEqual(fake.calls.videoStatus, [{ youtubeId: 'diskvideo01', status: 'none' }]);
  assert.deepEqual(fake.calls.audioStatus, [{ youtubeId: 'diskaudio01', status: 'none' }]);
  assert.equal(fake.calls.purgeExpired, 0);

  fake.intervals.find((timer) => timer.timeout === 60 * 60 * 1000).handler();
  assert.equal(fake.calls.purgeExpired, 1);
  assert.equal(fake.calls.checkDisk, 1);
  await runtime.stop('test');
});

test('stop is idempotent, clears timers, awaits active work and blocks future starts', async () => {
  const download = deferred();
  const feed = deferred();
  const fake = createFakeDependencies({
    downloadVideo() {
      return download.promise;
    },
    getRssChannels() {
      return [
        {
          id: 1,
          youtubeChannelId: 'UC_ONE',
          autoDownloadVideo: false,
          autoDownloadAudio: false,
        },
      ];
    },
    fetchFeed(youtubeChannelId) {
      fake.calls.fetchFeed.push(youtubeChannelId);
      return feed.promise;
    },
  });
  fake.queue.push(job(9, 'download_video', { youtubeId: 'active00001' }));
  const runtime = createWorkerRuntime(fake.dependencies);
  runtime.start();
  await flushPromises();

  const firstStop = runtime.stop('SIGTERM');
  const secondStop = runtime.stop('SIGTERM');
  let stopped = false;
  firstStop.then(() => {
    stopped = true;
  });
  await flushPromises();

  assert.equal(firstStop, secondStop);
  assert.equal(stopped, false);
  assert.equal(
    fake.intervals.every((timer) => timer.cleared),
    true,
  );

  download.resolve(10);
  feed.resolve([]);
  await firstStop;
  assert.equal(stopped, true);

  const takeCount = fake.calls.take;
  const fetchCount = fake.calls.fetchFeed.length;
  for (const timer of fake.intervals) timer.handler();
  runtime.start();
  assert.equal(await runtime.runNextJob(), false);
  assert.equal(runtime.startRssPoll(), undefined);
  await flushPromises();
  assert.equal(fake.calls.take, takeCount);
  assert.equal(fake.calls.fetchFeed.length, fetchCount);
});

test('production worker starts and shuts down cleanly on SIGTERM without external work', async () => {
  const smokeDirectory = await mkdtemp(join(tmpdir(), 'vidium-worker-smoke-test-'));
  const mediaDirectory = join(smokeDirectory, 'media');
  await mkdir(mediaDirectory, { recursive: true });

  const child = spawn(process.execPath, ['src/worker.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: '3000',
      HOST: '127.0.0.1',
      DB_PATH: join(smokeDirectory, 'empty.db'),
      MEDIA_DIR: mediaDirectory,
      DISK_HIGH_WATERMARK: '0.8',
      DISK_LOW_WATERMARK: '0.6',
      YTDLP_PROXY: '',
      PROXY_STATUS_PATH: '',
      YTDLP_COOKIES: '',
      CRAWL_INITIAL: '1',
      INVITE_CODE: 'worker-smoke-test-secret',
      SESSION_MAX_AGE: '60000',
      DEFAULT_LANG: 'en',
      ASSET_MANIFEST_PATH: join(smokeDirectory, 'missing-asset-manifest.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const started = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`worker did not start; stdout=${stdout}; stderr=${stderr}`));
    }, 5000);
    child.stdout.on('data', () => {
      if (!stdout.includes('worker started')) return;
      clearTimeout(timeout);
      resolve();
    });
    child.on('error', reject);
  });
  const closed = new Promise((resolve, reject) => {
    child.on('close', (code, signal) => resolve({ code, signal }));
    child.on('error', reject);
  });

  try {
    await started;
    child.kill('SIGTERM');
    const result = await closed;
    assert.deepEqual(result, { code: 0, signal: null });
    assert.match(stdout, /SIGTERM received; waiting for active work to finish/);
    assert.match(stdout, /worker stopped cleanly/);
    assert.equal(stderr, '');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(smokeDirectory, { recursive: true, force: true });
  }
});

test.after(async () => {
  db.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});
