import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { after, test, mock } from 'node:test';
import { createHttpHarness } from './http-test-helpers.mjs';

const h = await createHttpHarness('cinema');
after(() => h.close());
const dir = join(h.mediaDirectory, 'cinema');
await mkdir(dir);
const admin = h.sessionCookie(h.seedUser({ role: 'admin' })).header;
const user = h.sessionCookie(h.seedUser()).header;
const createUrl = '/api/admin/cinema/video';
const deleteUrl = `${createUrl}/delete`;
const post = (url, json, cookie = admin, origin = 'same') =>
  h.request(url, { method: 'POST', json, cookie, origin });
const catalog = async (cookie = user, query = '') =>
  h.parseBaked(await h.readHtml(await h.request(`/cinema${query}`, { cookie })))['cinema-page'];
const create = (title = 'Cinema only') =>
  post(createUrl, { title }).then((r) => h.readJson(r, 201));
const row = (uid) => h.db.prepare('SELECT * FROM cinema_videos WHERE uid = ?').get(uid);

test('cinema authorization, validation, XSS, independent schema and pagination', async () => {
  await h.readRedirect(await h.request('/cinema'), '/login');
  assert.equal(
    (await h.request(deleteUrl, { method: 'POST', json: { uid: 'a'.repeat(16) } })).status,
    401,
  );
  assert.equal(
    (await h.request(createUrl, { method: 'POST', json: { title: 'secret' } })).status,
    401,
  );
  assert.equal((await post(createUrl, { title: 'secret' }, user)).status, 403);
  assert.equal((await post(deleteUrl, { uid: 'a'.repeat(16) }, user)).status, 403);
  assert.equal((await post(createUrl, { title: 'secret' }, admin, 'hostile')).status, 403);
  for (const title of ['', '  ', 'x'.repeat(301), 42, null, {}, []]) {
    assert.equal((await post(createUrl, { title })).status, 400);
  }
  for (const body of ['{', 'null', '[]']) {
    assert.equal((await h.request(createUrl, { method: 'POST', cookie: admin, body })).status, 400);
  }
  assert.equal((await post(createUrl, { title: 'film', path: '/etc/passwd' })).status, 400);
  assert.equal((await post(deleteUrl, { uid: '../bad' })).status, 400);
  const existingChannel = h.seedChannel();
  const existingVideo = h.seedVideo({ channelId: existingChannel.id });
  h.db
    .prepare("INSERT INTO video_play_counts VALUES (?, 'video', 7, '2026-01-01', '2026-01-02')")
    .run(existingVideo.id);
  const before = h.mutableDatabaseSnapshot();
  const movie = await create('  <script>alert(1)</script>  ');
  assert.match(movie.uid, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(movie.title, '<script>alert(1)</script>');
  assert.equal(movie.expectedPath, join(dir, `${movie.uid}.mp4`));
  const duplicate = await create(movie.title);
  assert.notEqual(movie.uid, duplicate.uid);
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
  const html = await h.readHtml(await h.request('/cinema', { cookie: user }));
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes(h.mediaDirectory));
  assert.equal((await catalog()).items[0].ready, false);
  assert.ok((await catalog(admin)).items.every((item) => item.expectedPath && item.commands));
  const fresh = await import(`../../src/lib/db.ts?cinema-bootstrap=${Date.now()}`);
  assert.equal(fresh.db.prepare('SELECT COUNT(*) AS n FROM cinema_videos').get().n, 2);
  fresh.db.close();
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
  for (let i = 0; i < 42; i++) await create(`film ${i}`);
  assert.equal((await catalog()).items.length, 42);
  assert.equal((await catalog(user, '?page=2')).items.length, 2);
  assert.equal((await catalog(user, '?page=999')).page, 2);
  for (const item of (await catalog(user, '?page=2')).items)
    await post(deleteUrl, { uid: item.uid });
  assert.equal((await catalog(user, '?page=2')).page, 1);
  h.db.exec('DELETE FROM cinema_videos');
  assert.deepEqual((await catalog()).items, []);
  h.db.prepare('DELETE FROM videos WHERE id = ?').run(existingVideo.id);
  h.db.prepare('DELETE FROM channels WHERE id = ?').run(existingChannel.id);
});

test('cinema file lifecycle rejects partial, empty, directory, symlink and orphan files', async () => {
  const movie = await create();
  const path = movie.expectedPath;
  const media = `/cinema/media/${movie.uid}`;
  const player = `/cinema/v/${movie.uid}`;
  const unavailable = async () => {
    const response = await h.request(media, { cookie: user });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-accel-redirect'), null);
    assert.equal((await h.request(player, { cookie: user })).status, 404);
    assert.equal((await catalog()).items.find((item) => item.uid === movie.uid).ready, false);
  };
  await unavailable();
  await writeFile(`${path}.part`, 'video bytes');
  await unavailable();
  await rename(`${path}.part`, path);
  assert.equal((await catalog()).items[0].ready, true);
  const response = await h.request(media, { cookie: user });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('x-accel-redirect'),
    `/protected_media/cinema/${movie.uid}.mp4`,
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  const baked = h.parseBaked(await h.readHtml(await h.request(player, { cookie: user })));
  const state = baked[`player-cinema-${movie.uid}`];
  assert.equal(state.recordPlay, false);
  assert.equal(state.shareAvailable, false);
  assert.equal(state.channelHref, '/cinema');
  assert.equal(state.thumbSrc, '');
  assert.equal(state.mediaSrc, media);
  assert.match(state.resumeKey, /:cinema:/);
  assert.deepEqual(state.chapters, []);
  await h.readRedirect(await h.request(player), '/login');
  assert.equal((await h.request(media)).status, 404);
  await rm(path);
  await unavailable();
  assert.ok(row(movie.uid));
  await writeFile(path, '');
  await unavailable();
  await rm(path);
  await mkdir(path);
  await unavailable();
  await rm(path, { recursive: true });
  const target = join(h.temporaryDirectory, 'secret.mp4');
  await writeFile(target, 'secret');
  await symlink(target, path);
  await unavailable();
  await post(deleteUrl, { uid: movie.uid });
  assert.ok(await h.fileExists(target), 'unlink must not follow symlink');
  await writeFile(path, 'orphan');
  assert.equal((await h.request(media, { cookie: user })).status, 404);
  for (const uid of ['bad', '%2e%2e%2fsecret', `${movie.uid}.mp4.part`]) {
    assert.equal((await h.request(`/cinema/media/${uid}`, { cookie: user })).status, 404);
  }
});

test('cinema remains absent from legacy endpoints and feeds for every role', async () => {
  const movie = await create('Isolated cinema secret');
  await writeFile(movie.expectedPath, 'ready');
  for (const cookie of [undefined, user, admin]) {
    for (const prefix of ['/v/', '/a/', '/media/v/', '/media/a/', '/t/']) {
      const response = await h.request(`${prefix}${movie.uid}`, { cookie });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('x-accel-redirect'), null);
    }
    for (const endpoint of [
      '/feed',
      '/feed/ready',
      '/feed/manual',
      '/feed/test',
      `/api/status?ids=${movie.uid}`,
      '/api/since?since=2000-01-01',
      '/api/feed/cards?tag=all',
      '/api/feed/cards?tag=ready',
      '/api/feed/cards?tag=manual',
    ]) {
      const response = await h.request(endpoint, { cookie });
      const text = await response.text();
      assert.ok(!text.includes(movie.title), endpoint);
      assert.ok(!text.includes(movie.uid), endpoint);
    }
    const response = await h.request('/api/download', {
      method: 'POST',
      cookie,
      json: { uid: movie.uid, type: 'video' },
    });
    assert.equal(response.status, 404);
  }
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM videos').get().n, 0);
});

test('deletion is idempotent, keeps row on filesystem failure and retries partial deletion', async () => {
  const movie = await create();
  await writeFile(movie.expectedPath, 'ready');
  await mkdir(`${movie.expectedPath}.part`);
  assert.equal((await post(deleteUrl, { uid: movie.uid })).status, 500);
  assert.ok(row(movie.uid));
  assert.equal(await h.fileExists(movie.expectedPath), false);
  await rm(`${movie.expectedPath}.part`, { recursive: true });
  await writeFile(`${movie.expectedPath}.part`, 'partial');
  assert.equal((await post(deleteUrl, { uid: movie.uid })).status, 200);
  assert.equal(row(movie.uid), undefined);
  assert.equal(await h.fileExists(`${movie.expectedPath}.part`), false);
  assert.equal((await post(deleteUrl, { uid: movie.uid })).status, 200);
  const both = await create();
  await writeFile(both.expectedPath, 'ready');
  await writeFile(`${both.expectedPath}.part`, 'partial');
  assert.equal((await post(deleteUrl, { uid: both.uid })).status, 200);
  assert.equal(await h.fileExists(both.expectedPath), false);
  assert.equal(await h.fileExists(`${both.expectedPath}.part`), false);
});

test('unreadable files fail closed; unsafe directory and unlink errors preserve records', async () => {
  const movie = await create();
  await writeFile(movie.expectedPath, 'ready');
  const originalOpen = fs.openSync;
  const originalUnlink = fs.unlinkSync;
  try {
    mock.method(fs, 'openSync', (path, ...args) => {
      if (path === movie.expectedPath)
        throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
      return originalOpen(path, ...args);
    });
    mock.method(fs, 'unlinkSync', (path) => {
      if (path === movie.expectedPath)
        throw Object.assign(new Error('unlink denied'), { code: 'EACCES' });
      return originalUnlink(path);
    });
    syncBuiltinESMExports();
    assert.equal((await h.request(`/cinema/media/${movie.uid}`, { cookie: user })).status, 404);
    assert.equal((await post(deleteUrl, { uid: movie.uid })).status, 500);
    assert.ok(row(movie.uid));
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
  }
  const moved = `${dir}-moved`;
  await rename(dir, moved);
  await symlink(moved, dir);
  try {
    assert.equal((await h.request(`/cinema/media/${movie.uid}`, { cookie: user })).status, 404);
    assert.equal((await post(deleteUrl, { uid: movie.uid })).status, 500);
    assert.ok(row(movie.uid));
  } finally {
    await rm(dir);
    await rename(moved, dir);
  }
  assert.equal((await post(deleteUrl, { uid: movie.uid })).status, 200);
});

test('high disk usage cleanup removes YouTube cache but never cinema final or partial files', async () => {
  const { checkDisk } = await import('../../src/lib/disk.ts');
  const movie = await create();
  await writeFile(movie.expectedPath, 'ready');
  await writeFile(`${movie.expectedPath}.part`, 'partial');
  const cached = join(h.mediaDirectory, 'videos', 'cachedvideo.mp4');
  await writeFile(cached, 'YouTube cache');
  const deleted = [];
  try {
    mock.method(fs, 'statfsSync', () => ({ bsize: 4096, blocks: 100, bfree: 1, bavail: 1 }));
    syncBuiltinESMExports();
    await checkDisk((file) => deleted.push(file));
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
  }
  assert.deepEqual(deleted, [{ youtubeId: 'cachedvideo', type: 'video' }]);
  assert.equal(await h.fileExists(cached), false);
  assert.equal(await h.fileExists(movie.expectedPath), true);
  assert.equal(await h.fileExists(`${movie.expectedPath}.part`), true);
});

test('UID collisions retry only a bounded number of times', async () => {
  const existing = await create();
  const original = crypto.randomBytes;
  let calls = 0;
  try {
    mock.method(crypto, 'randomBytes', (size) => {
      calls++;
      return calls <= 2 ? Buffer.from(existing.uid, 'base64url') : original(size);
    });
    syncBuiltinESMExports();
    const next = await create();
    assert.notEqual(next.uid, existing.uid);
    assert.equal(calls, 3);
    mock.restoreAll();
    mock.method(crypto, 'randomBytes', () => {
      calls++;
      return Buffer.from(existing.uid, 'base64url');
    });
    syncBuiltinESMExports();
    calls = 0;
    assert.equal((await post(createUrl, { title: 'collision' })).status, 500);
    assert.equal(calls, 5);
    assert.equal(row(existing.uid).title, existing.title);
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
  }
});
