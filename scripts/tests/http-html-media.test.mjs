import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpHarness } from './http-test-helpers.mjs';

const h = await createHttpHarness('html-media');

test.beforeEach(() => h.cleanDatabase());
test.after(async () => h.close());

function seedCatalog() {
  const publicChannel = h.seedChannel({
    name: 'public-html',
    displayName: 'Public channel',
    guestVisible: true,
  });
  const privateChannel = h.seedChannel({
    name: 'private-html',
    displayName: 'Private channel',
  });
  h.seedTag(publicChannel.id, 'public-tag');
  h.seedTag(privateChannel.id, 'private-tag');
  const publicReady = h.seedVideo({
    channelId: publicChannel.id,
    uid: 'publicreadyuid01',
    youtubeId: 'publicvid01',
    title: 'Public ready',
    videoStatus: 'ready',
    audioStatus: 'ready',
  });
  const publicPending = h.seedVideo({
    channelId: publicChannel.id,
    uid: 'publicpending001',
    youtubeId: 'pendingvid1',
    title: 'Public pending',
  });
  const privateReady = h.seedVideo({
    channelId: privateChannel.id,
    uid: 'privatereadyuid1',
    youtubeId: 'privatevid1',
    title: 'Private ready',
    videoStatus: 'ready',
    audioStatus: 'ready',
  });
  return { publicChannel, privateChannel, publicReady, publicPending, privateReady };
}

async function readAccel(response, contentType, accelPath) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), contentType);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-accel-redirect'), accelPath);
  assert.equal(await response.text(), '');
}

test('guest and authenticated feed HTML bake public and private catalogs correctly', async () => {
  const catalog = seedCatalog();
  const user = h.seedUser({ login: 'feed-html-user' });
  const session = h.sessionCookie(user);
  const before = h.mutableDatabaseSnapshot();

  const guestHtml = await h.readHtml(await h.noOrigin('/feed?page=1'));
  const guest = h.parseBaked(guestHtml);
  assert.equal(guest['nav-controls'].isGuest, true);
  assert.deepEqual(
    new Set(guest['feed-card-pager'].cards.map((card) => card.uid)),
    new Set([catalog.publicReady.uid, catalog.publicPending.uid]),
  );
  assert.equal(guest['feed-card-pager'].total, 2);
  assert.deepEqual(
    guest['feed-page'].channels.map((channel) => channel.id),
    [catalog.publicChannel.id],
  );
  assert.deepEqual(
    guest['feed-page'].tags.map((tag) => tag.tag),
    ['public-tag'],
  );

  const userHtml = await h.readHtml(await h.noOrigin('/feed?page=1', { cookie: session.header }));
  const authenticated = h.parseBaked(userHtml);
  assert.equal(authenticated['nav-controls'].isGuest, false);
  assert.deepEqual(
    new Set(authenticated['feed-card-pager'].cards.map((card) => card.uid)),
    new Set([catalog.publicReady.uid, catalog.publicPending.uid, catalog.privateReady.uid]),
  );
  assert.equal(authenticated['feed-card-pager'].total, 3);
  assert.ok(
    authenticated['feed-page'].channels.some((channel) => channel.id === catalog.privateChannel.id),
  );
  assert.ok(authenticated['feed-page'].tags.some((tag) => tag.tag === 'private-tag'));

  await h.readRedirect(await h.noOrigin('/feed/ready'), '/feed');
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('channel HTML exposes public channels to guests and private channels to users', async () => {
  const catalog = seedCatalog();
  const user = h.seedUser({ login: 'channel-html-user' });
  const session = h.sessionCookie(user);
  const before = h.mutableDatabaseSnapshot();

  const publicPage = h.parseBaked(
    await h.readHtml(await h.noOrigin(`/channel/${catalog.publicChannel.id}`)),
  );
  assert.equal(publicPage[`channel-page-${catalog.publicChannel.id}`].title, 'Public channel');
  assert.equal(publicPage[`channel-card-pager-${catalog.publicChannel.id}`].total, 2);

  await h.readText(
    await h.noOrigin(`/channel/${catalog.privateChannel.id}`),
    404,
    'Channel not found',
  );

  const privatePage = h.parseBaked(
    await h.readHtml(
      await h.noOrigin(`/channel/${catalog.privateChannel.id}`, {
        cookie: session.header,
      }),
    ),
  );
  assert.equal(privatePage[`channel-page-${catalog.privateChannel.id}`].title, 'Private channel');
  assert.equal(privatePage[`channel-card-pager-${catalog.privateChannel.id}`].total, 1);
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('player HTML masks private or unready guest media and renders authorized pages', async () => {
  const catalog = seedCatalog();
  const user = h.seedUser({ login: 'player-html-user' });
  const session = h.sessionCookie(user);
  const before = h.mutableDatabaseSnapshot();

  for (const [kind, prefix] of [
    ['video', '/v'],
    ['audio', '/a'],
  ]) {
    const publicPage = h.parseBaked(
      await h.readHtml(await h.noOrigin(`${prefix}/${catalog.publicReady.uid}`)),
    );
    const state = publicPage[`player-${kind}-${catalog.publicReady.uid}`];
    assert.equal(state.uid, catalog.publicReady.uid);
    assert.equal(state.kind, kind);
    assert.equal(state.shareAvailable, true);

    await h.readText(await h.noOrigin(`${prefix}/${catalog.privateReady.uid}`), 404, 'Not found');
    await h.readText(await h.noOrigin(`${prefix}/${catalog.publicPending.uid}`), 404, 'Not found');

    const privatePage = h.parseBaked(
      await h.readHtml(
        await h.noOrigin(`${prefix}/${catalog.privateReady.uid}`, {
          cookie: session.header,
        }),
      ),
    );
    assert.equal(
      privatePage[`player-${kind}-${catalog.privateReady.uid}`].uid,
      catalog.privateReady.uid,
    );
  }
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('media entrypoints return exact X-Accel contracts for authorized media', async () => {
  const catalog = seedCatalog();
  const user = h.seedUser({ login: 'media-user' });
  const session = h.sessionCookie(user);
  const before = h.mutableDatabaseSnapshot();

  await readAccel(
    await h.noOrigin(`/media/v/${catalog.publicReady.uid}`),
    'video/mp4',
    `/protected_media/videos/${catalog.publicReady.youtubeId}.mp4`,
  );
  await readAccel(
    await h.noOrigin(`/media/a/${catalog.publicReady.uid}`),
    'audio/mp4',
    `/protected_media/audio/${catalog.publicReady.youtubeId}.m4a`,
  );
  await readAccel(
    await h.noOrigin(`/t/${catalog.publicPending.uid}`),
    'image/jpeg',
    `/protected_media/thumbs/${catalog.publicPending.youtubeId}.jpg`,
  );

  await readAccel(
    await h.noOrigin(`/media/v/${catalog.privateReady.uid}`, { cookie: session.header }),
    'video/mp4',
    `/protected_media/videos/${catalog.privateReady.youtubeId}.mp4`,
  );
  await readAccel(
    await h.noOrigin(`/media/a/${catalog.privateReady.uid}`, { cookie: session.header }),
    'audio/mp4',
    `/protected_media/audio/${catalog.privateReady.youtubeId}.m4a`,
  );
  await readAccel(
    await h.noOrigin(`/t/${catalog.privateReady.uid}`, { cookie: session.header }),
    'image/jpeg',
    `/protected_media/thumbs/${catalog.privateReady.youtubeId}.jpg`,
  );
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('private and unready guest media entrypoints are indistinguishable 404s', async () => {
  const catalog = seedCatalog();
  const before = h.mutableDatabaseSnapshot();

  for (const path of [
    `/media/v/${catalog.publicPending.uid}`,
    `/media/a/${catalog.publicPending.uid}`,
    `/media/v/${catalog.privateReady.uid}`,
    `/media/a/${catalog.privateReady.uid}`,
    `/t/${catalog.privateReady.uid}`,
  ]) {
    await h.readText(await h.noOrigin(path), 404, 'Not found');
  }
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});
