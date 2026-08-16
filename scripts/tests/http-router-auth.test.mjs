import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpHarness } from './http-test-helpers.mjs';

const h = await createHttpHarness('router-auth');

test.beforeEach(() => h.cleanDatabase());
test.after(async () => h.close());

function form(values) {
  return new URLSearchParams(values).toString();
}

function assertAuthCookie(cookie) {
  assert.equal(cookie.name, 'sid');
  assert.match(cookie.value, /^[a-f0-9]{64}$/);
  assert.ok(cookie.attributes.has('httponly'));
  assert.ok(cookie.attributes.has('samesite=lax'));
  assert.ok(cookie.attributes.has('secure'));
  assert.ok(cookie.attributes.has('path=/'));
  assert.ok(cookie.attributes.has('max-age=60'));
}

test('router decodes path params, ignores query strings, and returns 404 for misses', async () => {
  const before = h.mutableDatabaseSnapshot();

  const decoded = await h.noOrigin('/__test/decoded/hello%20world?ignored=/other');
  assert.deepEqual(await h.readJson(decoded, 200), { value: 'hello world' });

  const queriedRoute = await h.noOrigin('/login?path=/unknown');
  const loginHtml = await h.readHtml(queriedRoute);
  assert.ok(h.parseBaked(loginHtml)['login-page']);

  await h.readText(await h.noOrigin('/unknown'), 404, 'Not found');
  await h.readText(await h.noOrigin('/logout'), 404, 'Not found');

  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('unhandled errors return one 500 and do not rewrite an already-sent response', async () => {
  const before = h.mutableDatabaseSnapshot();
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    await h.readText(await h.noOrigin('/__test/error'), 500, 'Internal server error');
    await h.readText(await h.noOrigin('/__test/error-after-headers'), 200, 'already sent');
  } finally {
    console.error = originalError;
  }
  assert.equal(logged.length, 2);
  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('GET login and register return uncached HTML pages', async () => {
  const before = h.mutableDatabaseSnapshot();

  const login = h.parseBaked(await h.readHtml(await h.noOrigin('/login')));
  assert.equal(login['login-page'].action, '/login');
  assert.equal(login['login-page'].error, '');

  const register = h.parseBaked(await h.readHtml(await h.noOrigin('/register')));
  assert.equal(register['register-page'].action, '/register');
  assert.equal(register['register-page'].error, '');

  assert.deepEqual(h.mutableDatabaseSnapshot(), before);
});

test('registration validates input, creates a user session, and rejects a taken login', async () => {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '203.0.113.10',
  };

  const badInviteResponse = await h.noOrigin('/register', {
    method: 'POST',
    headers,
    body: form({ invite: 'wrong', login: 'alice', password: 'correct-password' }),
  });
  const badInvite = h.parseBaked(await h.readHtml(badInviteResponse));
  assert.notEqual(badInvite['register-page'].error, '');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);

  const badCredentialsResponse = await h.noOrigin('/register', {
    method: 'POST',
    headers,
    body: form({
      invite: 'http-integration-secret',
      login: 'ab',
      password: 'short',
    }),
  });
  const badCredentials = h.parseBaked(await h.readHtml(badCredentialsResponse));
  assert.notEqual(badCredentials['register-page'].error, '');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);

  const success = await h.noOrigin('/register', {
    method: 'POST',
    headers,
    body: form({
      invite: 'http-integration-secret',
      login: 'alice',
      password: 'correct-password',
    }),
  });
  const cookie = h.parseSetCookie(success);
  assertAuthCookie(cookie);
  await h.readRedirect(success, '/');
  assert.deepEqual(
    { ...h.db.prepare('SELECT login, role FROM users').get() },
    {
      login: 'alice',
      role: 'user',
    },
  );
  assert.deepEqual(
    { ...h.db.prepare('SELECT user_id, data FROM sessions WHERE sid = ?').get(cookie.value) },
    { user_id: 1, data: '{"lang":"en"}' },
  );

  const duplicate = await h.noOrigin('/register', {
    method: 'POST',
    headers,
    body: form({
      invite: 'http-integration-secret',
      login: 'alice',
      password: 'another-password',
    }),
  });
  const duplicatePage = h.parseBaked(await h.readHtml(duplicate));
  assert.notEqual(duplicatePage['register-page'].error, '');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
});

test('login reports failures, enforces the threshold, succeeds, and resets failures', async () => {
  await h.seedCredentialedUser({
    login: 'bob',
    password: 'correct-password',
  });
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '203.0.113.20',
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await h.noOrigin('/login', {
      method: 'POST',
      headers,
      body: form({ login: 'bob', password: 'wrong-password' }),
    });
    const baked = h.parseBaked(await h.readHtml(response));
    assert.notEqual(baked['login-page'].error, '');
  }
  const limited = h.parseBaked(
    await h.readHtml(
      await h.noOrigin('/login', {
        method: 'POST',
        headers,
        body: form({ login: 'bob', password: 'correct-password' }),
      }),
    ),
  );
  assert.match(limited['login-page'].error, /many|много/i);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);

  const resetHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '203.0.113.21',
  };
  await h.readHtml(
    await h.noOrigin('/login', {
      method: 'POST',
      headers: resetHeaders,
      body: form({ login: 'bob', password: 'wrong-password' }),
    }),
  );
  const success = await h.noOrigin('/login', {
    method: 'POST',
    headers: resetHeaders,
    body: form({ login: 'bob', password: 'correct-password' }),
  });
  const cookie = h.parseSetCookie(success);
  assertAuthCookie(cookie);
  await h.readRedirect(success, '/');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);

  const afterReset = h.parseBaked(
    await h.readHtml(
      await h.noOrigin('/login', {
        method: 'POST',
        headers: resetHeaders,
        body: form({ login: 'bob', password: 'wrong-password' }),
      }),
    ),
  );
  assert.notEqual(afterReset['login-page'].error, '');
  assert.doesNotMatch(afterReset['login-page'].error, /many|много/i);

  const repeatedLogin = await h.noOrigin('/login', { cookie: `sid=${cookie.value}` });
  await h.readRedirect(repeatedLogin, '/');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
});

test('logout deletes the session and expires the protected cookie', async () => {
  const user = h.seedUser({ login: 'logout-user' });
  const session = h.sessionCookie(user);
  assert.ok(h.sessions.getSession(session.sid));

  const response = await h.noOrigin('/logout', { method: 'POST', cookie: session.header });
  const cookie = h.parseSetCookie(response);
  assert.equal(cookie.name, 'sid');
  assert.equal(cookie.value, '');
  assert.ok(cookie.attributes.has('httponly'));
  assert.ok(cookie.attributes.has('samesite=lax'));
  assert.ok(cookie.attributes.has('secure'));
  assert.ok(cookie.attributes.has('max-age=0'));
  assert.ok(cookie.attributes.has('path=/'));
  await h.readRedirect(response, '/');
  assert.equal(h.sessions.getSession(session.sid), undefined);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
});

test('missing and expired sessions produce HTML redirects and API 401 responses', async () => {
  const missingHtml = await h.noOrigin('/admin');
  await h.readRedirect(missingHtml, '/login');
  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/sidebar/mode', {
        method: 'POST',
        json: { mode: 'channels' },
      }),
      401,
    ),
    { error: 'unauthorized' },
  );

  const user = h.seedUser({ login: 'expired-user' });
  const expired = h.sessionCookie(user);
  h.db
    .prepare("UPDATE sessions SET expires = '2000-01-01T00:00:00.000Z' WHERE sid = ?")
    .run(expired.sid);

  await h.readRedirect(await h.noOrigin('/admin', { cookie: expired.header }), '/login');
  assert.deepEqual(
    await h.readJson(
      await h.sameOrigin('/api/sidebar/mode', {
        method: 'POST',
        cookie: expired.header,
        json: { mode: 'channels' },
      }),
      401,
    ),
    { error: 'unauthorized' },
  );
  assert.equal(h.sessions.getSession(expired.sid), undefined);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
});
