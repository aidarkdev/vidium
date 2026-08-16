import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHarness } from './http-test-helpers.mjs';

const h = await createHttpHarness('authorization-admin');

test.beforeEach(() => h.cleanDatabase());
test.after(async () => h.close());

const ADMIN_APIS = [
  '/api/channel',
  '/api/video',
  '/api/channel/display-name',
  '/api/channel/tags',
  '/api/channel/auto-download',
  '/api/channel/guest-visible',
  '/api/channel/rss-enabled',
  '/api/channel/reorder',
  '/api/tag/reorder',
  '/api/tag/delete',
  '/api/admin/video/files/delete',
  '/api/admin/video/delete',
  '/api/admin/job/delete',
  '/api/admin/video/status/reset',
  '/api/admin/user/role',
];

test('every admin API enforces guest, user, Origin, and admin validation boundaries', async () => {
  const user = h.seedUser({ login: 'matrix-user' });
  const admin = h.seedUser({ login: 'matrix-admin', role: 'admin' });
  const userSession = h.sessionCookie(user);
  const adminSession = h.sessionCookie(admin);

  for (const path of ADMIN_APIS) {
    const beforeGuest = h.mutableDatabaseSnapshot();
    assert.deepEqual(
      await h.readJson(await h.sameOrigin(path, { method: 'POST', json: {} }), 401),
      { error: 'unauthorized' },
      `${path}: guest`,
    );
    assert.deepEqual(h.mutableDatabaseSnapshot(), beforeGuest, `${path}: guest mutated DB`);

    const beforeUser = h.mutableDatabaseSnapshot();
    assert.deepEqual(
      await h.readJson(
        await h.sameOrigin(path, { method: 'POST', cookie: userSession.header, json: {} }),
        403,
      ),
      { error: 'forbidden' },
      `${path}: user`,
    );
    assert.deepEqual(h.mutableDatabaseSnapshot(), beforeUser, `${path}: user mutated DB`);

    const beforeHostile = h.mutableDatabaseSnapshot();
    assert.deepEqual(
      await h.readJson(
        await h.hostileOrigin(path, {
          method: 'POST',
          cookie: adminSession.header,
          json: {},
        }),
        403,
      ),
      { error: 'forbidden' },
      `${path}: hostile Origin`,
    );
    assert.deepEqual(
      h.mutableDatabaseSnapshot(),
      beforeHostile,
      `${path}: hostile Origin mutated DB`,
    );

    const beforeValidation = h.mutableDatabaseSnapshot();
    const validation = await h.sameOrigin(path, {
      method: 'POST',
      cookie: adminSession.header,
      json: {},
    });
    const validationBody = await h.readJson(validation, 400);
    assert.equal(typeof validationBody.error, 'string', `${path}: admin did not reach validation`);
    assert.deepEqual(
      h.mutableDatabaseSnapshot(),
      beforeValidation,
      `${path}: invalid admin request mutated DB`,
    );
  }
});

test('admin HTML authorization redirects guests, forbids users, and renders for admins', async () => {
  const user = h.seedUser({ login: 'html-user' });
  const admin = h.seedUser({ login: 'html-admin', role: 'admin' });
  const userSession = h.sessionCookie(user);
  const adminSession = h.sessionCookie(admin);
  const before = h.mutableDatabaseSnapshot();

  await h.readRedirect(await h.noOrigin('/admin'), '/login');
  await h.readText(await h.noOrigin('/admin', { cookie: userSession.header }), 403, 'Forbidden');
  const baked = h.parseBaked(
    await h.readHtml(await h.noOrigin('/admin', { cookie: adminSession.header })),
  );
  assert.ok(baked['admin-page']);
  assert.equal(baked['nav-controls'].isAdmin, true);
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('admin creates a channel and mutates its display, tags, download, guest, and RSS flags', async () => {
  const admin = h.seedUser({ login: 'channel-admin', role: 'admin' });
  const session = h.sessionCookie(admin);

  const added = await h.readJson(
    await h.sameOrigin('/api/channel', {
      method: 'POST',
      cookie: session.header,
      json: {
        url: 'https://www.youtube.com/@integration-channel',
        displayName: 'Initial name',
        tags: 'News,tech,news',
      },
    }),
    200,
  );
  assert.equal(added.ok, true);
  assert.equal(added.status, 'added');
  const channelId = added.channelId;
  assert.deepEqual(
    {
      ...h.db
        .prepare(`
          SELECT name, url, display_name, auto_download_video, auto_download_audio,
                 guest_visible, rss_enabled
          FROM channels WHERE id = ?
        `)
        .get(channelId),
    },
    {
      name: 'integration-channel',
      url: 'https://www.youtube.com/@integration-channel',
      display_name: 'Initial name',
      auto_download_video: 0,
      auto_download_audio: 0,
      guest_visible: 0,
      rss_enabled: 1,
    },
  );
  assert.deepEqual(
    h.db
      .prepare('SELECT tag FROM channel_tags WHERE channel_id = ? ORDER BY tag')
      .all(channelId)
      .map((row) => row.tag),
    ['news', 'tech'],
  );
  assert.deepEqual(
    h.db
      .prepare('SELECT type, payload, status FROM jobs')
      .all()
      .map((row) => ({ ...row })),
    [
      {
        type: 'crawl_channel',
        payload: JSON.stringify({ channelId, url: 'https://www.youtube.com/@integration-channel' }),
        status: 'pending',
      },
    ],
  );

  const mutations = [
    ['/api/channel/display-name', { channelId, displayName: 'Renamed channel' }],
    ['/api/channel/tags', { channelId, tags: 'science,video' }],
    ['/api/channel/auto-download', { channelId, type: 'video', enabled: true }],
    ['/api/channel/auto-download', { channelId, type: 'audio', enabled: true }],
    ['/api/channel/guest-visible', { channelId, enabled: true }],
    ['/api/channel/rss-enabled', { channelId, enabled: false }],
  ];
  for (const [path, json] of mutations) {
    const body = await h.readJson(
      await h.sameOrigin(path, { method: 'POST', cookie: session.header, json }),
      200,
    );
    assert.equal(body.ok, true);
    assert.equal(body.saved, true);
  }

  assert.deepEqual(
    {
      ...h.db
        .prepare(`
          SELECT display_name, auto_download_video, auto_download_audio,
                 guest_visible, rss_enabled
          FROM channels WHERE id = ?
        `)
        .get(channelId),
    },
    {
      display_name: 'Renamed channel',
      auto_download_video: 1,
      auto_download_audio: 1,
      guest_visible: 1,
      rss_enabled: 0,
    },
  );
  assert.deepEqual(
    h.db
      .prepare('SELECT tag FROM channel_tags WHERE channel_id = ? ORDER BY tag')
      .all(channelId)
      .map((row) => row.tag),
    ['science', 'video'],
  );
});

test('admin reorders channels and tags and deleting a tag cascades assignments', async () => {
  const admin = h.seedUser({ login: 'order-admin', role: 'admin' });
  const session = h.sessionCookie(admin);
  const alpha = h.seedChannel({ name: 'alpha' });
  const beta = h.seedChannel({ name: 'beta' });
  h.seedTag(alpha.id, 'alpha-tag');
  h.seedTag(alpha.id, 'beta-tag');
  h.seedTag(beta.id, 'beta-tag');

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/channel/reorder', {
        method: 'POST',
        cookie: session.header,
        json: { channelId: beta.id, direction: 'up' },
      }),
      200,
    ),
    { ok: true, moved: true },
  );
  assert.deepEqual(
    h.db
      .prepare('SELECT name, sort_order FROM channels WHERE id != 1 ORDER BY sort_order')
      .all()
      .map((row) => ({ ...row })),
    [
      { name: 'beta', sort_order: 10 },
      { name: 'alpha', sort_order: 20 },
    ],
  );

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/tag/reorder', {
        method: 'POST',
        cookie: session.header,
        json: { tag: 'beta-tag', direction: 'up' },
      }),
      200,
    ),
    { ok: true, moved: true },
  );
  assert.deepEqual(
    h.db
      .prepare('SELECT tag, sort_order FROM tags ORDER BY sort_order')
      .all()
      .map((row) => ({ ...row })),
    [
      { tag: 'beta-tag', sort_order: 10 },
      { tag: 'alpha-tag', sort_order: 20 },
    ],
  );

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/tag/delete', {
        method: 'POST',
        cookie: session.header,
        json: { tag: 'beta-tag' },
      }),
      200,
    ),
    { ok: true, deleted: true, tag: 'beta-tag' },
  );
  assert.equal(
    h.db.prepare("SELECT COUNT(*) AS count FROM tags WHERE tag = 'beta-tag'").get().count,
    0,
  );
  assert.equal(
    h.db.prepare("SELECT COUNT(*) AS count FROM channel_tags WHERE tag = 'beta-tag'").get().count,
    0,
  );
});

test('add-video uses fake yt-dlp and handles invalid URLs and metadata failures', async () => {
  const admin = h.seedUser({ login: 'video-admin', role: 'admin' });
  const session = h.sessionCookie(admin);

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/video', {
        method: 'POST',
        cookie: session.header,
        json: { url: 'https://example.com/not-youtube' },
      }),
      400,
    ),
    { error: 'invalid YouTube video URL' },
  );
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM videos').get().count, 0);

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/video', {
        method: 'POST',
        cookie: session.header,
        json: { url: 'https://www.youtube.com/watch?v=failmeta001' },
      }),
      502,
    ),
    { error: 'failed to fetch video metadata' },
  );
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM videos').get().count, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);

  const success = await h.readJson(
    await h.sameOrigin('/api/video', {
      method: 'POST',
      cookie: session.header,
      json: { url: 'https://youtu.be/goodmeta001?t=2' },
    }),
    200,
  );
  assert.deepEqual(success, { ok: true, status: 'added', youtubeId: 'goodmeta001' });
  const video = h.db
    .prepare(`
      SELECT channel_id, youtube_id, title, date, duration, source_type,
             video_status, audio_status
      FROM videos
    `)
    .get();
  assert.deepEqual(
    { ...video },
    {
      channel_id: 1,
      youtube_id: 'goodmeta001',
      title: 'Fake metadata title',
      date: '2026-08-15',
      duration: 321,
      source_type: 'manual',
      video_status: 'none',
      audio_status: 'none',
    },
  );
  assert.deepEqual(
    { ...h.db.prepare('SELECT type, payload, status FROM jobs').get() },
    {
      type: 'download_thumbnail',
      payload: '{"youtubeId":"goodmeta001"}',
      status: 'pending',
    },
  );
});

test('admin deletes media files and resets only statuses for files that existed', async () => {
  const admin = h.seedUser({ login: 'files-admin', role: 'admin' });
  const session = h.sessionCookie(admin);
  const channel = h.seedChannel({ name: 'files-channel' });
  const video = h.seedVideo({
    channelId: channel.id,
    youtubeId: 'filesvid001',
    videoStatus: 'ready',
    audioStatus: 'ready',
  });
  const videoPath = join(h.mediaDirectory, 'videos', `${video.youtubeId}.mp4`);
  const audioPath = join(h.mediaDirectory, 'audio', `${video.youtubeId}.m4a`);
  await mkdir(join(h.mediaDirectory, 'videos'), { recursive: true });
  await writeFile(videoPath, 'video');
  assert.equal(await h.fileExists(videoPath), true);
  assert.equal(await h.fileExists(audioPath), false);

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/admin/video/files/delete', {
        method: 'POST',
        cookie: session.header,
        json: { youtubeId: video.youtubeId },
      }),
      200,
    ),
    { ok: true, videoDeleted: true, audioDeleted: false },
  );
  assert.equal(await h.fileExists(videoPath), false);
  assert.deepEqual(
    { ...h.db.prepare('SELECT video_status, audio_status FROM videos').get() },
    { video_status: 'none', audio_status: 'ready' },
  );
});

test('admin deletes a video, its jobs and files', async () => {
  const admin = h.seedUser({ login: 'delete-admin', role: 'admin' });
  const session = h.sessionCookie(admin);
  const channel = h.seedChannel({ name: 'delete-channel' });
  const video = h.seedVideo({ channelId: channel.id, youtubeId: 'deletevid01' });
  h.seedJob({ youtubeId: video.youtubeId, type: 'download_video' });
  h.seedJob({ youtubeId: video.youtubeId, type: 'download_audio' });
  const videoPath = join(h.mediaDirectory, 'videos', `${video.youtubeId}.mp4`);
  const audioPath = join(h.mediaDirectory, 'audio', `${video.youtubeId}.m4a`);
  await writeFile(videoPath, 'video');
  await writeFile(audioPath, 'audio');

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/admin/video/delete', {
        method: 'POST',
        cookie: session.header,
        json: { youtubeId: video.youtubeId },
      }),
      200,
    ),
    {
      ok: true,
      videoDeleted: true,
      audioDeleted: true,
      videoRemoved: true,
      jobsRemoved: 2,
    },
  );
  assert.equal(await h.fileExists(videoPath), false);
  assert.equal(await h.fileExists(audioPath), false);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM videos').get().count, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);
});

test('deleting a job resets its media status and explicit reset removes download jobs', async () => {
  const admin = h.seedUser({ login: 'reset-admin', role: 'admin' });
  const session = h.sessionCookie(admin);
  const channel = h.seedChannel({ name: 'reset-channel' });
  const first = h.seedVideo({ channelId: channel.id, videoStatus: 'queued' });
  const firstJob = h.seedJob({ youtubeId: first.youtubeId, type: 'download_video' });

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/admin/job/delete', {
        method: 'POST',
        cookie: session.header,
        json: { jobId: firstJob.id },
      }),
      200,
    ),
    {
      ok: true,
      deleted: true,
      resetStatus: { youtubeId: first.youtubeId, statusType: 'video' },
    },
  );
  assert.equal(
    h.db.prepare('SELECT video_status FROM videos WHERE id = ?').get(first.id).video_status,
    'none',
  );
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);

  const second = h.seedVideo({
    channelId: channel.id,
    videoStatus: 'downloading',
    audioStatus: 'ready',
  });
  h.seedJob({ youtubeId: second.youtubeId, type: 'download_video' });
  h.seedJob({ youtubeId: second.youtubeId, type: 'download_audio' });
  h.seedJob({ youtubeId: second.youtubeId, type: 'download_thumbnail' });

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/admin/video/status/reset', {
        method: 'POST',
        cookie: session.header,
        json: { youtubeId: second.youtubeId },
      }),
      200,
    ),
    {
      ok: true,
      resetStatus: {
        youtubeId: second.youtubeId,
        resetVideo: true,
        resetAudio: false,
      },
      jobsRemoved: 2,
    },
  );
  assert.deepEqual(
    {
      ...h.db.prepare('SELECT video_status, audio_status FROM videos WHERE id = ?').get(second.id),
    },
    { video_status: 'none', audio_status: 'ready' },
  );
  assert.deepEqual(
    h.db
      .prepare('SELECT type FROM jobs')
      .all()
      .map((row) => row.type),
    ['download_thumbnail'],
  );
});

test('admin changes another user role but cannot remove their own admin role', async () => {
  const admin = h.seedUser({ login: 'role-admin', role: 'admin' });
  const user = h.seedUser({ login: 'role-user' });
  const session = h.sessionCookie(admin);

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/admin/user/role', {
        method: 'POST',
        cookie: session.header,
        json: { userId: user.id, role: 'admin' },
      }),
      200,
    ),
    { ok: true, saved: true },
  );
  assert.equal(h.db.prepare('SELECT role FROM users WHERE id = ?').get(user.id).role, 'admin');

  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/admin/user/role', {
        method: 'POST',
        cookie: session.header,
        json: { userId: admin.id, role: 'user' },
      }),
      403,
    ),
    { error: 'cannot change your own admin role' },
  );
  assert.equal(h.db.prepare('SELECT role FROM users WHERE id = ?').get(admin.id).role, 'admin');
});
