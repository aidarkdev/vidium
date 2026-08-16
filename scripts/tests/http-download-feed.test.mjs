import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpHarness } from './http-test-helpers.mjs';

const h = await createHttpHarness('download-feed');

test.beforeEach(() => h.cleanDatabase());
test.after(async () => h.close());

test('download rejects invalid JSON, uid/type, missing videos, and hostile origins', async () => {
  const channel = h.seedChannel({ name: 'public-invalid', guestVisible: true });
  const video = h.seedVideo({ channelId: channel.id });
  const before = h.mutableDatabaseSnapshot();

  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      400,
    ),
    { error: 'invalid json' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/download', {
        method: 'POST',
        json: { uid: 'bad', type: 'video' },
      }),
      400,
    ),
    { error: 'invalid request' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/download', {
        method: 'POST',
        json: { uid: video.uid, type: 'subtitle' },
      }),
      400,
    ),
    { error: 'invalid request' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/download', {
        method: 'POST',
        json: { uid: 'missinguid0000000', type: 'video' },
      }),
      404,
    ),
    { error: 'not found' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.hostileOrigin('/api/download', {
        method: 'POST',
        json: { uid: video.uid, type: 'video' },
      }),
      403,
    ),
    { error: 'forbidden' },
  );
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('guest download sees public videos while an authenticated user can queue private videos', async () => {
  const publicChannel = h.seedChannel({ name: 'public-download', guestVisible: true });
  const privateChannel = h.seedChannel({ name: 'private-download' });
  const publicVideo = h.seedVideo({ channelId: publicChannel.id });
  const privateVideo = h.seedVideo({ channelId: privateChannel.id });
  const user = h.seedUser({ login: 'download-user' });
  const session = h.sessionCookie(user);

  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/download', {
        method: 'POST',
        json: { uid: privateVideo.uid, type: 'video' },
      }),
      404,
    ),
    { error: 'not found' },
  );
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);

  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/download', {
        method: 'POST',
        json: { uid: publicVideo.uid, type: 'video' },
      }),
      200,
    ),
    { ok: true, status: 'queued' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/download', {
        method: 'POST',
        cookie: session.header,
        json: { uid: privateVideo.uid, type: 'audio' },
      }),
      200,
    ),
    { ok: true, status: 'queued' },
  );

  assert.deepEqual(
    {
      ...h.db
        .prepare('SELECT video_status, audio_status FROM videos WHERE id = ?')
        .get(publicVideo.id),
    },
    { video_status: 'queued', audio_status: 'none' },
  );
  assert.deepEqual(
    {
      ...h.db
        .prepare('SELECT video_status, audio_status FROM videos WHERE id = ?')
        .get(privateVideo.id),
    },
    { video_status: 'none', audio_status: 'queued' },
  );
  assert.deepEqual(
    h.db
      .prepare('SELECT type, payload FROM jobs ORDER BY id')
      .all()
      .map((row) => ({ ...row })),
    [
      { type: 'download_video', payload: JSON.stringify({ youtubeId: publicVideo.youtubeId }) },
      { type: 'download_audio', payload: JSON.stringify({ youtubeId: privateVideo.youtubeId }) },
    ],
  );
});

test('none and expired media queue once while queued, downloading, and ready are idempotent', async () => {
  const channel = h.seedChannel({ name: 'download-state', guestVisible: true });
  const none = h.seedVideo({ channelId: channel.id, videoStatus: 'none' });
  const expired = h.seedVideo({ channelId: channel.id, audioStatus: 'expired' });

  for (const [uid, type] of [
    [none.uid, 'video'],
    [expired.uid, 'audio'],
  ]) {
    assert.deepEqual(
      await h.readJson(
        await h.noOrigin('/api/download', { method: 'POST', json: { uid, type } }),
        200,
      ),
      { ok: true, status: 'queued' },
    );
  }
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 2);
  assert.equal(
    h.db.prepare('SELECT video_status FROM videos WHERE id = ?').get(none.id).video_status,
    'queued',
  );
  assert.equal(
    h.db.prepare('SELECT audio_status FROM videos WHERE id = ?').get(expired.id).audio_status,
    'queued',
  );

  for (const status of ['queued', 'downloading', 'ready']) {
    const video = h.seedVideo({ channelId: channel.id, videoStatus: status });
    const jobsBefore = h.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count;
    assert.deepEqual(
      await h.readJson(
        await h.noOrigin('/api/download', {
          method: 'POST',
          json: { uid: video.uid, type: 'video' },
        }),
        200,
      ),
      { ok: true, status },
    );
    assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, jobsBefore);
    assert.equal(
      h.db.prepare('SELECT video_status FROM videos WHERE id = ?').get(video.id).video_status,
      status,
    );
  }
});

test('play rejects invalid JSON, uid/kind, and missing videos without changing SQLite', async () => {
  const before = h.mutableDatabaseSnapshot();
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
      400,
    ),
    { error: 'invalid json' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        json: { uid: 'bad', kind: 'video' },
      }),
      400,
    ),
    { error: 'invalid request' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        json: { uid: 'missinguid0000000', kind: 'subtitle' },
      }),
      400,
    ),
    { error: 'invalid request' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        json: { uid: 'missinguid0000000', kind: 'video' },
      }),
      404,
    ),
    { error: 'not found' },
  );
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('play requires guest readiness, deduplicates counts, and returns 429 with Retry-After', async () => {
  const publicChannel = h.seedChannel({ name: 'public-play', guestVisible: true });
  const privateChannel = h.seedChannel({ name: 'private-play' });
  const ready = h.seedVideo({
    channelId: publicChannel.id,
    videoStatus: 'ready',
    audioStatus: 'none',
  });
  const notReady = h.seedVideo({ channelId: publicChannel.id });
  const privateReady = h.seedVideo({ channelId: privateChannel.id, videoStatus: 'ready' });
  const headers = { 'X-Real-IP': '203.0.113.50' };

  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        headers,
        json: { uid: notReady.uid, kind: 'video' },
      }),
      404,
    ),
    { error: 'not found' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        headers,
        json: { uid: ready.uid, kind: 'audio' },
      }),
      404,
    ),
    { error: 'not found' },
  );
  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        headers,
        json: { uid: privateReady.uid, kind: 'video' },
      }),
      404,
    ),
    { error: 'not found' },
  );

  assert.deepEqual(
    await h.readJson(
      await h.noOrigin('/api/play', {
        method: 'POST',
        headers,
        json: { uid: ready.uid, kind: 'video' },
      }),
      200,
    ),
    { ok: true, recorded: true },
  );
  for (let request = 1; request < 30; request++) {
    assert.deepEqual(
      await h.readJson(
        await h.noOrigin('/api/play', {
          method: 'POST',
          headers,
          json: { uid: ready.uid, kind: 'video' },
        }),
        200,
      ),
      { ok: true, recorded: false },
    );
  }
  const limited = await h.noOrigin('/api/play', {
    method: 'POST',
    headers,
    json: { uid: ready.uid, kind: 'video' },
  });
  assert.equal(limited.headers.get('retry-after'), '3600');
  assert.deepEqual(await h.readJson(limited, 429), { error: 'rate limited' });
  assert.deepEqual(
    { ...h.db.prepare('SELECT kind, play_count FROM video_play_counts').get() },
    { kind: 'video', play_count: 1 },
  );

  const user = h.seedUser({ login: 'play-user' });
  const session = h.sessionCookie(user);
  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/play', {
        method: 'POST',
        cookie: session.header,
        json: { uid: privateReady.uid, kind: 'video' },
      }),
      200,
    ),
    { ok: true, recorded: true },
  );
  assert.equal(
    h.db.prepare('SELECT SUM(play_count) AS count FROM video_play_counts').get().count,
    2,
  );
});

test('status silently skips invalid, missing, and private guest uids', async () => {
  const publicChannel = h.seedChannel({ name: 'public-status', guestVisible: true });
  const privateChannel = h.seedChannel({ name: 'private-status' });
  const publicVideo = h.seedVideo({
    channelId: publicChannel.id,
    videoStatus: 'ready',
    audioStatus: 'queued',
  });
  const privateVideo = h.seedVideo({
    channelId: privateChannel.id,
    videoStatus: 'downloading',
    audioStatus: 'ready',
  });
  const user = h.seedUser({ login: 'status-user' });
  const session = h.sessionCookie(user);
  const before = h.mutableDatabaseSnapshot();
  const ids = [publicVideo.uid, privateVideo.uid, 'bad', 'missinguid0000000'].join(',');

  assert.deepEqual(await h.readJson(await h.noOrigin(`/api/status?ids=${ids}`), 200), {
    [publicVideo.uid]: { video: 'ready', audio: 'queued' },
  });
  assert.deepEqual(
    await h.readJson(await h.noOrigin(`/api/status?ids=${ids}`, { cookie: session.header }), 200),
    {
      [publicVideo.uid]: { video: 'ready', audio: 'queued' },
      [privateVideo.uid]: { video: 'downloading', audio: 'ready' },
    },
  );
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('feed cards filter guest data and honor channel, tag, page, and pagination metadata', async () => {
  const publicChannel = h.seedChannel({ name: 'public-feed', guestVisible: true });
  const privateChannel = h.seedChannel({ name: 'private-feed' });
  h.seedTag(publicChannel.id, 'topic');
  h.seedTag(privateChannel.id, 'topic');
  const publicUids = [];
  for (let index = 0; index < 43; index++) {
    const video = h.seedVideo({
      channelId: publicChannel.id,
      uid: `publicuid${String(index).padStart(8, '0')}`,
      youtubeId: `pub${String(index).padStart(8, '0')}`,
      title: `Public ${index}`,
      date: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
    });
    publicUids.push(video.uid);
  }
  const privateVideo = h.seedVideo({
    channelId: privateChannel.id,
    uid: 'privateuid0000001',
    youtubeId: 'private00001',
    title: 'Private card',
  });
  const user = h.seedUser({ login: 'feed-user' });
  const session = h.sessionCookie(user);
  const before = h.mutableDatabaseSnapshot();

  const guestPage = await h.readJson(await h.noOrigin('/api/feed/cards?tag=topic&page=999'), 200);
  assert.equal(guestPage.ok, true);
  assert.equal(guestPage.page, 2);
  assert.equal(guestPage.pageSize, 42);
  assert.equal(guestPage.pageCount, 2);
  assert.equal(guestPage.total, 43);
  assert.equal(guestPage.cards.length, 1);
  assert.ok(publicUids.includes(guestPage.cards[0].uid));
  assert.equal('youtubeId' in guestPage.cards[0], false);

  const authenticatedPage = await h.readJson(
    await h.noOrigin('/api/feed/cards?tag=topic&page=2', { cookie: session.header }),
    200,
  );
  assert.equal(authenticatedPage.page, 2);
  assert.equal(authenticatedPage.pageCount, 2);
  assert.equal(authenticatedPage.total, 44);
  assert.equal(authenticatedPage.cards.length, 2);
  const authenticatedFirstPage = await h.readJson(
    await h.noOrigin('/api/feed/cards?tag=topic&page=1', { cookie: session.header }),
    200,
  );
  assert.ok(
    [...authenticatedFirstPage.cards, ...authenticatedPage.cards].some(
      (card) => card.uid === privateVideo.uid,
    ),
  );

  const publicChannelPage = await h.readJson(
    await h.noOrigin(`/api/feed/cards?channelId=${publicChannel.id}&tag=missing&page=2`),
    200,
  );
  assert.equal(publicChannelPage.total, 43);
  assert.equal(publicChannelPage.page, 2);
  assert.equal(publicChannelPage.cards.length, 1);

  const privateChannelPage = await h.readJson(
    await h.noOrigin(`/api/feed/cards?channelId=${privateChannel.id}`),
    200,
  );
  assert.deepEqual(privateChannelPage.cards, []);
  assert.equal(privateChannelPage.total, 0);
  assert.equal(privateChannelPage.page, 1);
  assert.equal(privateChannelPage.pageCount, 1);

  const restrictedGuestTag = await h.readJson(
    await h.noOrigin('/api/feed/cards?tag=manual&page=1'),
    200,
  );
  assert.equal(restrictedGuestTag.total, 43);
  assert.equal(restrictedGuestTag.cards.length, 42);
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});
