import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HASH_PLACEHOLDER = `${'00'.repeat(16)}:${'00'.repeat(64)}`;

export async function createHttpHarness(name) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `vidium-http-${name}-`));
  const mediaDirectory = join(temporaryDirectory, 'media');
  const fakeBinDirectory = join(temporaryDirectory, 'bin');
  await mkdir(fakeBinDirectory, { recursive: true });
  await mkdir(join(mediaDirectory, 'videos'), { recursive: true });
  await mkdir(join(mediaDirectory, 'audio'), { recursive: true });
  await mkdir(join(mediaDirectory, 'thumbs'), { recursive: true });

  const fakeYtDlp = join(fakeBinDirectory, 'yt-dlp');
  await writeFile(
    fakeYtDlp,
    `#!/bin/sh
case "$*" in
  *--js-runtimes\\ node:*) ;;
  *) echo "yt-dlp must receive the Node.js runtime" >&2; exit 1 ;;
esac
case "$*" in
  *failmeta001*) echo "metadata failed" >&2; exit 1 ;;
esac
printf '%s\n' '{"id":"goodmeta001","title":"Fake metadata title","upload_date":"20260815","duration":321}'
`,
  );
  await chmod(fakeYtDlp, 0o755);

  Object.assign(process.env, {
    PORT: '3000',
    HOST: '127.0.0.1',
    DB_PATH: join(temporaryDirectory, 'vidium.db'),
    MEDIA_DIR: mediaDirectory,
    DISK_HIGH_WATERMARK: '0.8',
    DISK_LOW_WATERMARK: '0.6',
    YTDLP_PROXY: '',
    PROXY_STATUS_PATH: '',
    YTDLP_COOKIES: '',
    CRAWL_INITIAL: '1',
    INVITE_CODE: 'http-integration-secret',
    SESSION_MAX_AGE: '60000',
    DEFAULT_LANG: 'en',
    ASSET_MANIFEST_PATH: join(temporaryDirectory, 'missing-asset-manifest.json'),
    PATH: `${fakeBinDirectory}:${process.env.PATH ?? ''}`,
  });

  const [{ db }, auth, sessions, serverModule] = await Promise.all([
    import('../../src/lib/db.ts'),
    import('../../src/lib/auth/auth.ts'),
    import('../../src/lib/auth/sessions.ts'),
    import('../../src/server.ts'),
  ]);

  const router = serverModule.createAppRouter();
  router.get('/__test/decoded/:value', (_req, res, params) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(params));
  });
  router.get('/__test/error', () => {
    throw new Error('expected integration test error');
  });
  router.get('/__test/error-after-headers', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('already sent');
    throw new Error('expected error after headers');
  });

  const server = serverModule.createAppServer(router);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  let nextUid = 1;
  let nextYoutubeId = 1;

  function uniqueUid(prefix = 'uid') {
    const suffix = String(nextUid++).padStart(16, '0');
    return `${prefix}${suffix}`.slice(0, 22).padEnd(16, 'x');
  }

  function uniqueYoutubeId() {
    return `yt${String(nextYoutubeId++).padStart(9, '0')}`;
  }

  function cleanDatabase() {
    db.exec(`
      DELETE FROM video_play_events;
      DELETE FROM video_play_counts;
      DELETE FROM sessions;
      DELETE FROM jobs;
      DELETE FROM videos;
      DELETE FROM channel_tags;
      DELETE FROM tags;
      DELETE FROM users;
      DELETE FROM channels WHERE id != 1;
      UPDATE channels
      SET name = 'manual', url = '', youtube_channel_id = '', last_crawled = NULL,
          display_name = 'Загрузки', sort_order = 0,
          auto_download_video = 0, auto_download_audio = 0,
          guest_visible = 0, rss_enabled = 1
      WHERE id = 1;
      DELETE FROM sqlite_sequence
      WHERE name IN ('channels', 'videos', 'jobs', 'users', 'video_play_events');
    `);
    nextUid = 1;
    nextYoutubeId = 1;
  }

  function seedUser({ login = uniqueUid('user').slice(0, 20), role = 'user' } = {}) {
    const result = db
      .prepare('INSERT INTO users (login, password_hash, role) VALUES (?, ?, ?)')
      .run(login, HASH_PLACEHOLDER, role);
    return { id: Number(result.lastInsertRowid), login, role };
  }

  async function seedCredentialedUser({ login, password, role = 'user' }) {
    const user = await auth.register(login, password);
    if (role !== 'user') db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
    return { ...user, role };
  }

  function sessionCookie(user, data = { lang: 'en' }) {
    const sid = sessions.createSession(user.id, data);
    return { sid, header: `sid=${encodeURIComponent(sid)}` };
  }

  function seedChannel({
    name = uniqueUid('channel').slice(0, 20),
    url,
    displayName = '',
    guestVisible = false,
    rssEnabled = true,
    sortOrder = 0,
  } = {}) {
    const channelUrl = url ?? `https://www.youtube.com/@${name}`;
    const result = db
      .prepare(`
        INSERT INTO channels (
          name, url, display_name, guest_visible, rss_enabled, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(name, channelUrl, displayName, guestVisible ? 1 : 0, rssEnabled ? 1 : 0, sortOrder);
    return {
      id: Number(result.lastInsertRowid),
      name,
      url: channelUrl,
      displayName,
      guestVisible,
    };
  }

  function seedTag(channelId, tag, sortOrder = 0) {
    db.prepare('INSERT OR IGNORE INTO tags (tag, label, sort_order) VALUES (?, ?, ?)').run(
      tag,
      tag,
      sortOrder,
    );
    db.prepare('INSERT INTO channel_tags (channel_id, tag) VALUES (?, ?)').run(channelId, tag);
  }

  function seedVideo({
    channelId,
    uid = uniqueUid(),
    youtubeId = uniqueYoutubeId(),
    title = `Video ${youtubeId}`,
    date = '2026-08-15',
    duration = 120,
    videoStatus = 'none',
    audioStatus = 'none',
    sourceType = 'channel',
    chapters = [],
  }) {
    const result = db
      .prepare(`
        INSERT INTO videos (
          channel_id, uid, youtube_id, title, date, duration,
          video_status, audio_status, source_type, chapters_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        channelId,
        uid,
        youtubeId,
        title,
        date,
        duration,
        videoStatus,
        audioStatus,
        sourceType,
        JSON.stringify(chapters),
      );
    return { id: Number(result.lastInsertRowid), channelId, uid, youtubeId, title };
  }

  function seedJob({ type = 'download_video', youtubeId, status = 'pending', attempts = 0 }) {
    const result = db
      .prepare('INSERT INTO jobs (type, payload, status, attempts) VALUES (?, ?, ?, ?)')
      .run(type, JSON.stringify({ youtubeId }), status, attempts);
    return { id: Number(result.lastInsertRowid), type, youtubeId, status };
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers ?? {});
    if (options.cookie) headers.set('Cookie', options.cookie);
    if (options.origin === 'same') headers.set('Origin', origin);
    if (options.origin === 'hostile') headers.set('Origin', 'https://hostile.example');
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${origin}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      redirect: 'manual',
    });
  }

  function sameOrigin(path, options = {}) {
    return request(path, { ...options, origin: 'same' });
  }

  function hostileOrigin(path, options = {}) {
    return request(path, { ...options, origin: 'hostile' });
  }

  function noOrigin(path, options = {}) {
    return request(path, { ...options, origin: undefined });
  }

  function parseSetCookie(response) {
    const raw = response.headers.get('set-cookie');
    assert.ok(raw, 'expected Set-Cookie header');
    const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    return {
      raw,
      name: pair.slice(0, separator),
      value: decodeURIComponent(pair.slice(separator + 1)),
      attributes: new Set(attributes.map((attribute) => attribute.toLowerCase())),
    };
  }

  async function readJson(response, expectedStatus) {
    assert.equal(response.status, expectedStatus);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.notEqual(body, '');
    return JSON.parse(body);
  }

  async function readHtml(response, expectedStatus = 200) {
    assert.equal(response.status, expectedStatus);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html; charset=utf-8$/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    const body = await response.text();
    assert.match(body, /^<!DOCTYPE html>/);
    return body;
  }

  async function readText(response, expectedStatus, expectedBody) {
    assert.equal(response.status, expectedStatus);
    assert.match(response.headers.get('content-type') ?? '', /^text\/plain\b/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    if (expectedBody !== undefined) assert.equal(body, expectedBody);
    return body;
  }

  async function readRedirect(response, location) {
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), location);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '');
  }

  function parseBaked(html) {
    const match = html.match(/<script type="application\/json" id="__BAKED__">([^<]*)<\/script>/);
    assert.ok(match, 'expected baked JSON');
    return JSON.parse(match[1]);
  }

  function mutableDatabaseSnapshot() {
    const selects = [
      ['tags', 'tag'],
      ['channels', 'id'],
      ['channel_tags', 'channel_id, tag'],
      ['videos', 'id'],
      ['jobs', 'id'],
      ['users', 'id'],
      ['sessions', 'sid'],
      ['video_play_events', 'id'],
      ['video_play_counts', 'video_id, kind'],
    ];
    return Object.fromEntries(
      selects.map(([table, order]) => [
        table,
        db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all(),
      ]),
    );
  }

  async function fileExists(path) {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  return {
    auth,
    sessions,
    db,
    server,
    origin,
    temporaryDirectory,
    mediaDirectory,
    cleanDatabase,
    seedUser,
    seedCredentialedUser,
    sessionCookie,
    seedChannel,
    seedTag,
    seedVideo,
    seedJob,
    uniqueUid,
    uniqueYoutubeId,
    request,
    sameOrigin,
    hostileOrigin,
    noOrigin,
    parseSetCookie,
    readJson,
    readHtml,
    readText,
    readRedirect,
    parseBaked,
    mutableDatabaseSnapshot,
    fileExists,
    close,
  };
}
