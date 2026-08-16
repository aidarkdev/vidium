import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, test } from 'node:test';
import {
  createFrontendBrowserHarness,
  destroyPart,
  mountRealPart,
  partState,
  preparePage,
} from './frontend-browser-test-helpers.mjs';
import {
  UID_ONE,
  UID_TWO,
  adminState,
  card,
  feedPageState,
  feedPagerState,
  mediaQueueState,
  navState,
  playerState,
} from './frontend-browser-test-states.mjs';

let harness;

before(async () => {
  harness = await createFrontendBrowserHarness();
});

after(async () => {
  await harness?.close();
});

function browserTest(name, callback) {
  test(name, async (t) => {
    const page = await harness.newPage();
    t.after(() => page.close());
    await callback(page, t);
  });
}

async function mountCustomPart(page, { id, state = {}, params = {}, source }) {
  await preparePage(page, { [id]: state });
  return page.evaluate(
    async ({ instanceId, mountParams, moduleSource }) => {
      const anchor = document.createElement('script');
      anchor.setAttribute('mount-dot', `mount-dot-${instanceId}`);
      document.body.append(anchor);
      const engine = await import('/engine/core.js');
      const partModule = Function(`"use strict"; return (${moduleSource});`)();
      const instance = engine.mount(partModule, { id: instanceId, ...mountParams });
      window.__VIDIUM_TEST__ = { engine, instance, partModule };
      return { html: instance.root.outerHTML, state: instance.state };
    },
    { instanceId: id, mountParams: params, moduleSource: source },
  );
}

test('frontend fixture serves only safe browser modules with JavaScript MIME', async () => {
  const engine = await fetch(`${harness.origin}/engine/core.js`);
  assert.equal(engine.status, 200);
  assert.match(engine.headers.get('content-type') ?? '', /^text\/javascript; charset=utf-8$/);

  const part = await fetch(`${harness.origin}/parts/feed-page/index.js`);
  assert.equal(part.status, 200);
  assert.match(part.headers.get('content-type') ?? '', /^text\/javascript; charset=utf-8$/);
  assert.doesNotMatch(await part.text(), /baker/);

  const baker = await fetch(`${harness.origin}/parts/feed-page/baker.ts`);
  assert.equal(baker.status, 404);

  const fixtureUrl = new URL(harness.origin);
  const traversalStatus = await new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: fixtureUrl.hostname,
        port: fixtureUrl.port,
        path: '/parts/%2e%2e/engine/core.js',
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(traversalStatus, 403);
});

browserTest('engine escape covers all five HTML-sensitive characters', async (page) => {
  const escaped = await page.evaluate(async () => {
    const { escape: htmlEscape } = await import('/engine/core.js');
    return htmlEscape(`<>&"'`);
  });
  assert.equal(escaped, '&lt;&gt;&amp;&quot;&#39;');
});

browserTest('engine baked state wins over microState', async (page) => {
  const result = await mountCustomPart(page, {
    id: 'priority',
    state: { source: 'baked' },
    params: { microState: { source: 'fallback' } },
    source: `({
      template: (state) => '<div data-ref="value">' + state.source + '</div>',
      templates: {},
      handlers: { state: {} },
    })`,
  });
  assert.equal(result.state.source, 'baked');
  assert.match(result.html, />baked</);
});

browserTest('engine falls back to microState when baked slice is absent', async (page) => {
  await preparePage(page, {});
  const state = await page.evaluate(async () => {
    const anchor = document.createElement('script');
    anchor.setAttribute('mount-dot', 'mount-dot-fallback');
    document.body.append(anchor);
    const { mount } = await import('/engine/core.js');
    return mount(
      { template: () => '<div></div>', templates: {}, handlers: { state: {} } },
      { id: 'fallback', microState: { source: 'micro' } },
    ).state;
  });
  assert.deepEqual(state, { source: 'micro' });
});

browserTest('engine defaults initial state to an empty object', async (page) => {
  await preparePage(page, {});
  const state = await page.evaluate(async () => {
    const anchor = document.createElement('script');
    anchor.setAttribute('mount-dot', 'mount-dot-empty');
    document.body.append(anchor);
    const { mount } = await import('/engine/core.js');
    return mount(
      { template: () => '<div></div>', templates: {}, handlers: { state: {} } },
      { id: 'empty' },
    ).state;
  });
  assert.deepEqual(state, {});
});

browserTest('engine rejects non-string, empty, and multi-root templates', async (page) => {
  await preparePage(page, {});
  const messages = await page.evaluate(async () => {
    const { mount } = await import('/engine/core.js');
    const results = [];
    const values = [null, '', '<i></i><b></b>'];
    for (const [index, value] of values.entries()) {
      const id = `invalid-template-${index}`;
      const anchor = document.createElement('script');
      anchor.setAttribute('mount-dot', `mount-dot-${id}`);
      document.body.append(anchor);
      try {
        mount({ template: () => value, handlers: {} }, { id });
      } catch (error) {
        results.push(error.message);
      }
    }
    return results;
  });
  assert.deepEqual(messages, [
    'Template must return a string',
    'Template must return exactly one root element, got 0',
    'Template must return exactly one root element, got 2',
  ]);
});

browserTest('engine rejects duplicate refs, ids, and MacroState owner paths', async (page) => {
  await preparePage(page, {});
  const messages = await page.evaluate(async () => {
    const engine = await import('/engine/core.js');
    const anchor = (id) => {
      const node = document.createElement('script');
      node.setAttribute('mount-dot', `mount-dot-${id}`);
      document.body.append(node);
    };
    const simple = { template: () => '<div></div>', handlers: { state: {} } };
    const errors = [];

    anchor('refs');
    try {
      engine.mount(
        { template: () => '<div data-ref="same"><i data-ref="same"></i></div>', handlers: {} },
        { id: 'refs' },
      );
    } catch (error) {
      errors.push(error.message);
    }

    anchor('duplicate');
    engine.mount(simple, { id: 'duplicate' });
    anchor('duplicate');
    try {
      engine.mount(simple, { id: 'duplicate' });
    } catch (error) {
      errors.push(error.message);
    }

    anchor('macro');
    engine.mount(simple, { id: 'macro', expose: ['path.value'] });
    anchor('macro.path');
    try {
      engine.mount(simple, { id: 'macro.path', expose: ['value'] });
    } catch (error) {
      errors.push(error.message);
    }
    return errors;
  });
  assert.match(messages[0], /Duplicate data-ref="same"/);
  assert.equal(messages[1], 'Duplicate part id duplicate');
  assert.equal(messages[2], 'Duplicate MacroState owner path macro.path.value');
});

browserTest('engine collects refs from the root and descendants', async (page) => {
  await mountCustomPart(page, {
    id: 'refs-all',
    source: `({
      template: () => '<section data-ref="root"><span data-ref="child"></span></section>',
      templates: {}, handlers: { state: {} },
    })`,
  });
  const refs = await page.evaluate(() => ({
    root: window.__VIDIUM_TEST__.instance.refs.root === window.__VIDIUM_TEST__.instance.root,
    child: window.__VIDIUM_TEST__.instance.refs.child.tagName,
  }));
  assert.deepEqual(refs, { root: true, child: 'SPAN' });
});

browserTest('engine delegated events use the first matching handler', async (page) => {
  await mountCustomPart(page, {
    id: 'delegation',
    state: { calls: '' },
    source: `({
      template: () => '<div><button class="specific" data-action="go"><span>go</span></button></div>',
      templates: {},
      handlers: {
        events: {
          'click [data-action="go"]': (part) => part.set('calls', part.state.calls + 'first'),
          'click .specific': (part) => part.set('calls', part.state.calls + 'second'),
        },
        state: { calls: () => {} },
      },
    })`,
  });
  await page.locator('button span').click();
  assert.equal(await page.evaluate(() => window.__VIDIUM_TEST__.instance.state.calls), 'first');
});

browserTest('engine events change state and state handlers own the DOM update', async (page) => {
  await mountCustomPart(page, {
    id: 'event-state-dom',
    state: { count: 0 },
    source: `({
      template: (state) => '<button data-action="increment" data-ref="button">' + state.count + '</button>',
      templates: {},
      handlers: {
        events: { 'click [data-action="increment"]': (part) => part.set('count', part.state.count + 1) },
        state: { count: (part, value) => { part.refs.button.textContent = String(value); } },
      },
    })`,
  });
  await page.locator('button').click();
  assert.equal(await page.locator('button').textContent(), '1');
  assert.equal(await page.evaluate(() => window.__VIDIUM_TEST__.instance.state.count), 1);
});

browserTest('engine single and batch set are atomic and equality is a no-op', async (page) => {
  await mountCustomPart(page, {
    id: 'sets',
    state: { a: 1, b: 2 },
    source: `({
      template: () => '<div></div>', templates: {},
      handlers: { state: {
        a: (part, value, oldValue) => (part.private.calls ??= []).push(['a', value, oldValue, part.state.b]),
        b: (part, value, oldValue) => (part.private.calls ??= []).push(['b', value, oldValue, part.state.a]),
      } },
    })`,
  });
  const result = await page.evaluate(() => {
    const part = window.__VIDIUM_TEST__.instance;
    part.set('a', 3);
    part.set({ a: 4, b: 5 });
    part.set({ a: 4, b: 5 });
    return { state: part.state, calls: part.private.calls };
  });
  assert.deepEqual(result.state, { a: 4, b: 5 });
  assert.deepEqual(result.calls, [
    ['a', 3, 1, 2],
    ['a', 4, 3, 5],
    ['b', 5, 2, 4],
  ]);
});

browserTest(
  'engine expose/subscribe mirrors initial and synchronous values and forbids writes',
  async (page) => {
    await preparePage(page, { owner: { value: 1 }, subscriber: { mirror: 0 } });
    const result = await page.evaluate(async () => {
      const engine = await import('/engine/core.js');
      const addAnchor = (id) => {
        const anchor = document.createElement('script');
        anchor.setAttribute('mount-dot', `mount-dot-${id}`);
        document.body.append(anchor);
      };
      addAnchor('owner');
      const owner = engine.mount(
        { template: () => '<div></div>', handlers: { state: { value: () => {} } } },
        { id: 'owner', expose: ['value'] },
      );
      addAnchor('subscriber');
      const subscriber = engine.mount(
        {
          template: (state) => `<div>${state.mirror}</div>`,
          handlers: {
            state: {
              mirror: (part, value) => {
                part.private.seen ??= [];
                part.private.seen.push(value);
              },
            },
          },
        },
        { id: 'subscriber', subscribe: { mirror: 'owner.value' } },
      );
      const initial = subscriber.state.mirror;
      owner.set('value', 2);
      const afterSet = subscriber.state.mirror;
      let writeError = '';
      try {
        subscriber.set('mirror', 3);
      } catch (error) {
        writeError = error.message;
      }
      return { initial, afterSet, seen: subscriber.private.seen, writeError };
    });
    assert.deepEqual(result, {
      initial: 1,
      afterSet: 2,
      seen: [2],
      writeError: 'Cannot set mirror field "mirror" in part subscriber',
    });
  },
);

browserTest('engine warns for unknown owners and missing state handlers', async (page) => {
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await preparePage(page, {});
  await page.evaluate(async () => {
    const { mount } = await import('/engine/core.js');
    for (const [id, handlers, subscribe] of [
      ['missing-handler', { state: {} }, { mirror: 'unknown.value' }],
      ['unknown-owner', { state: { mirror: () => {} } }, { mirror: 'unknown.value' }],
    ]) {
      const anchor = document.createElement('script');
      anchor.setAttribute('mount-dot', `mount-dot-${id}`);
      document.body.append(anchor);
      mount({ template: () => '<div></div>', handlers }, { id, subscribe });
    }
  });
  assert.ok(warnings.some((value) => value.includes('has no state handler')));
  assert.ok(warnings.some((value) => value.includes('is not registered')));
});

browserTest(
  'engine destroy releases listeners, subscriptions, owner paths, root, and id',
  async (page) => {
    await preparePage(page, { owner: { value: 1 }, subscriber: { mirror: 0, clicks: 0 } });
    const result = await page.evaluate(async () => {
      const engine = await import('/engine/core.js');
      const addAnchor = (id) => {
        const anchor = document.createElement('script');
        anchor.setAttribute('mount-dot', `mount-dot-${id}`);
        document.body.append(anchor);
      };
      const ownerModule = {
        template: () => '<div></div>',
        handlers: { state: { value: () => {} } },
      };
      addAnchor('owner');
      const owner = engine.mount(ownerModule, { id: 'owner', expose: ['value'] });
      addAnchor('subscriber');
      const subscriber = engine.mount(
        {
          template: () => '<button data-action="click">click</button>',
          handlers: {
            events: {
              'click [data-action="click"]': (part) => part.set('clicks', part.state.clicks + 1),
            },
            state: {
              clicks: () => {},
              mirror: (part, value) => (part.private.removed = value),
            },
          },
        },
        { id: 'subscriber', subscribe: { mirror: 'owner.value' } },
      );
      const detachedRoot = subscriber.root;
      engine.destroy(subscriber);
      detachedRoot.click();
      owner.set('value', 2);
      addAnchor('subscriber');
      const remounted = engine.mount(
        { template: () => '<div></div>', handlers: { state: {} } },
        { id: 'subscriber' },
      );
      engine.destroy(owner);
      addAnchor('owner');
      const ownerAgain = engine.mount(ownerModule, { id: 'owner', expose: ['value'] });
      return {
        detached: !detachedRoot.isConnected,
        clicks: subscriber.state.clicks,
        mirrorAfterSubscriberDestroy: subscriber.state.mirror,
        remountedConnected: remounted.root.isConnected,
        ownerAgainConnected: ownerAgain.root.isConnected,
      };
    });
    assert.deepEqual(result, {
      detached: true,
      clicks: 0,
      mirrorAfterSubscriberDestroy: 1,
      remountedConnected: true,
      ownerAgainConnected: true,
    });
  },
);

browserTest('engine owner destroy notifies a live mirror with undefined', async (page) => {
  await preparePage(page, { owner: { value: 7 }, subscriber: {} });
  const result = await page.evaluate(async () => {
    const engine = await import('/engine/core.js');
    const addAnchor = (id) => {
      const anchor = document.createElement('script');
      anchor.setAttribute('mount-dot', `mount-dot-${id}`);
      document.body.append(anchor);
    };
    addAnchor('owner');
    const owner = engine.mount(
      { template: () => '<div></div>', handlers: { state: {} } },
      { id: 'owner', expose: ['value'] },
    );
    addAnchor('subscriber');
    const subscriber = engine.mount(
      {
        template: () => '<div></div>',
        handlers: { state: { mirror: (part, value) => (part.private.notified = value) } },
      },
      { id: 'subscriber', subscribe: { mirror: 'owner.value' } },
    );
    engine.destroy(owner);
    return {
      hasMirror: Object.hasOwn(subscriber.state, 'mirror'),
      mirror: subscriber.state.mirror ?? 'undefined',
      notified: subscriber.private.notified ?? 'undefined',
    };
  });
  assert.deepEqual(result, { hasMirror: true, mirror: 'undefined', notified: 'undefined' });
});

browserTest('engine repeated destroy and set-after-destroy warn and no-op', async (page) => {
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await mountCustomPart(page, {
    id: 'dead',
    state: { value: 1 },
    source: `({ template: () => '<div></div>', handlers: { state: { value: () => {} } } })`,
  });
  const state = await page.evaluate(() => {
    const { engine, instance } = window.__VIDIUM_TEST__;
    engine.destroy(instance);
    engine.destroy(instance);
    instance.set('value', 2);
    return instance.state;
  });
  assert.deepEqual(state, { value: 1 });
  assert.ok(warnings.some((value) => value.includes('destroy called twice')));
  assert.ok(warnings.some((value) => value.includes('set called after destroy')));
});

browserTest('engine logs onDestroy errors and completes teardown', async (page) => {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await mountCustomPart(page, {
    id: 'destroy-error',
    source: `({
      template: () => '<div></div>',
      handlers: { state: {}, onDestroy: () => { throw new Error('destroy exploded'); } },
    })`,
  });
  const connected = await page.evaluate(() => {
    const { engine, instance } = window.__VIDIUM_TEST__;
    engine.destroy(instance);
    return instance.root.isConnected;
  });
  assert.equal(connected, false);
  assert.ok(errors.some((value) => value.includes('destroy exploded')));
});

browserTest(
  'feed page reorders channels, disables pending controls, and reports failure',
  async (page) => {
    let releaseSuccess;
    await page.route('**/api/channel/reorder', async (route) => {
      const body = route.request().postDataJSON();
      if (body.channelId === 3 && body.direction === 'up') {
        await new Promise((resolve) => {
          releaseSuccess = resolve;
        });
        await route.fulfill({ status: 200, json: { ok: true, moved: true } });
        return;
      }
      await route.fulfill({ status: 500, json: { ok: false, error: 'failed' } });
    });
    await mountRealPart(page, {
      partName: 'feed-page',
      id: 'feed-page',
      state: feedPageState(),
    });

    await page
      .locator('[data-channel-id="3"] [data-action="move-channel"][data-direction="up"]')
      .click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.movingChannelId === 3,
    );
    assert.equal(await page.locator('[data-channel-id="3"] input').isDisabled(), true);
    releaseSuccess();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.movingChannelId === 0,
    );

    const success = await page.evaluate(() => ({
      stateIds: window.__VIDIUM_TEST__.instances['feed-page'].state.channels.map((item) => item.id),
      domIds: [
        ...document.querySelectorAll('[data-ref="sidebarChannels"] > [data-channel-id]'),
      ].map((node) => Number(node.dataset.channelId)),
    }));
    assert.deepEqual(success, { stateIds: [1, 3, 2], domIds: [3, 2] });
    assert.equal(await page.locator('[data-channel-id="3"] input').isEnabled(), true);

    await page
      .locator('[data-channel-id="3"] [data-action="move-channel"][data-direction="down"]')
      .click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.movingChannelId === 0,
    );
    assert.equal(await page.locator('[data-ref="actionError"]').textContent(), 'Action failed');
    assert.equal(await page.locator('[data-ref="actionError"]').isVisible(), true);
  },
);

browserTest(
  'feed page reorders and deletes tags with confirmation and failure handling',
  async (page) => {
    let reorderCalls = 0;
    await page.route('**/api/tag/reorder', async (route) => {
      reorderCalls += 1;
      await route.fulfill(
        reorderCalls === 1
          ? { status: 200, json: { ok: true, moved: true } }
          : { status: 500, json: { ok: false, error: 'failed' } },
      );
    });
    await page.route('**/api/tag/delete', (route) =>
      route.fulfill({ status: 200, json: { ok: true, deleted: true, tag: 'news' } }),
    );
    await mountRealPart(page, {
      partName: 'feed-page',
      id: 'feed-page',
      state: feedPageState({ sidebarMode: 'tags' }),
    });

    await page.locator('[data-tag="tech"] [data-action="move-tag"][data-direction="up"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.movingTag === '',
    );
    assert.deepEqual(
      await page.evaluate(() =>
        window.__VIDIUM_TEST__.instances['feed-page'].state.tags.map((item) => item.tag),
      ),
      ['tech', 'news'],
    );

    await page.locator('[data-tag="tech"] [data-action="move-tag"][data-direction="down"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.movingTag === '',
    );
    assert.equal((await partState(page, 'feed-page')).actionError, 'Action failed');

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('[data-tag="news"] [data-action="delete-tag"]').click();
    assert.equal((await partState(page, 'feed-page')).tags.length, 2);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-tag="news"] [data-action="delete-tag"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.tags.length === 1,
    );
    assert.equal(await page.locator('[data-tag="news"]').count(), 0);
  },
);

browserTest(
  'feed page patches display name and toggles save controls around the request',
  async (page) => {
    let release;
    await page.route('**/api/channel/display-name', async (route) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      await route.fulfill({ status: 200, json: { ok: true, saved: true } });
    });
    await mountRealPart(page, {
      partName: 'feed-page',
      id: 'feed-page',
      state: feedPageState({ activeChannelId: 2 }),
    });
    const form = page.locator('[data-channel-id="2"] form');
    await form.locator('input[name="displayName"]').fill('Renamed');
    await form.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.savingChannelNameId === 2,
    );
    assert.equal(await form.locator('input').isDisabled(), true);
    release();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-page'].state.savingChannelNameId === 0,
    );

    const state = await partState(page, 'feed-page');
    assert.equal(state.channels.find((item) => item.id === 2).displayName, 'Renamed');
    assert.equal(await page.locator('[data-channel-id="2"] a').textContent(), 'Renamed');
    assert.equal(await page.locator('[data-ref="title"]').textContent(), 'Renamed');
  },
);

browserTest(
  'feed page document listener closes the sidebar and is removed on destroy',
  async (page) => {
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await mountRealPart(page, {
      partName: 'feed-page',
      id: 'feed-page',
      state: feedPageState(),
    });
    await page.locator('[data-action="toggle-sidebar"]').click();
    assert.equal((await partState(page, 'feed-page')).sidebarOpen, true);
    await page.evaluate(() =>
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    assert.equal((await partState(page, 'feed-page')).sidebarOpen, false);

    await destroyPart(page, 'feed-page');
    await page.evaluate(() => {
      const part = window.__VIDIUM_TEST__.instances['feed-page'];
      part.state.sidebarOpen = true;
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    assert.equal((await partState(page, 'feed-page')).sidebarOpen, true);
    assert.equal(warnings.length, 0);
  },
);

browserTest(
  'nav controls handle added, exists, and error responses and reset successful forms',
  async (page) => {
    await page.route('**/api/channel', async (route) => {
      const { url } = route.request().postDataJSON();
      if (url.endsWith('/added')) {
        await route.fulfill({ status: 200, json: { ok: true, status: 'added' } });
      } else if (url.endsWith('/exists')) {
        await route.fulfill({ status: 200, json: { ok: true, status: 'exists' } });
      } else {
        await route.fulfill({ status: 400, json: { ok: false, error: 'Channel rejected' } });
      }
    });
    await page.route('**/api/video', async (route) => {
      const { url } = route.request().postDataJSON();
      if (url.endsWith('/added')) {
        await route.fulfill({ status: 200, json: { ok: true, status: 'added' } });
      } else if (url.endsWith('/exists')) {
        await route.fulfill({ status: 200, json: { ok: true, status: 'exists' } });
      } else {
        await route.fulfill({ status: 500, json: { ok: false } });
      }
    });
    await mountRealPart(page, {
      partName: 'nav-controls',
      id: 'nav-controls',
      state: navState(),
    });

    await page.locator('[data-ref="summary"]').click();
    await page.locator('[data-ref="channelDetails"] > summary').click();
    await page.locator('[data-ref="videoDetails"] > summary').click();

    const channelForm = page.locator('[data-action="add-channel"]');
    await channelForm.locator('[name="url"]').fill('https://example.test/added');
    await channelForm.locator('[name="displayName"]').fill('Alpha');
    await channelForm.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['nav-controls'].state.channelMsg === 'Channel added',
    );
    assert.equal(await channelForm.locator('[name="url"]').inputValue(), '');
    assert.match(await page.locator('[data-ref="channelMsg"]').getAttribute('class'), /ok/);

    await page.locator('[data-ref="channelDetails"] > summary').click();
    await channelForm.locator('[name="url"]').fill('https://example.test/exists');
    await channelForm.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['nav-controls'].state.channelMsg === 'Channel exists',
    );
    assert.match(await page.locator('[data-ref="channelMsg"]').getAttribute('class'), /warn/);

    await page.locator('[data-ref="channelDetails"] > summary').click();
    await channelForm.locator('[name="url"]').fill('https://example.test/error');
    await channelForm.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(
      () =>
        window.__VIDIUM_TEST__.instances['nav-controls'].state.channelMsg === 'Channel rejected',
    );
    assert.match(await page.locator('[data-ref="channelMsg"]').getAttribute('class'), /error/);

    const videoForm = page.locator('[data-action="add-video"]');
    await videoForm.locator('[name="url"]').fill('https://example.test/added');
    await videoForm.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['nav-controls'].state.videoMsg === 'Video added',
    );
    assert.equal(await videoForm.locator('[name="url"]').inputValue(), '');

    await page.locator('[data-ref="videoDetails"] > summary').click();
    await videoForm.locator('[name="url"]').fill('https://example.test/exists');
    await videoForm.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['nav-controls'].state.videoMsg === 'Video exists',
    );

    await page.locator('[data-ref="videoDetails"] > summary').click();
    await videoForm.locator('[name="url"]').fill('https://example.test/error');
    await videoForm.evaluate((node) => node.requestSubmit());
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['nav-controls'].state.videoMsg === 'Video error',
    );
  },
);

browserTest('nav dropdown follows summary, outside click, and Escape', async (page) => {
  await mountRealPart(page, {
    partName: 'nav-controls',
    id: 'nav-controls',
    state: navState(),
  });
  await page.locator('[data-ref="summary"]').click();
  await page.waitForFunction(
    () => window.__VIDIUM_TEST__.instances['nav-controls'].state.dropdownOpen,
  );
  assert.equal(await page.locator('[data-ref="summary"]').getAttribute('aria-expanded'), 'true');

  await page.evaluate(() =>
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  assert.equal((await partState(page, 'nav-controls')).dropdownOpen, false);

  await page.locator('[data-ref="summary"]').click();
  await page.keyboard.press('Escape');
  assert.equal((await partState(page, 'nav-controls')).dropdownOpen, false);
});

browserTest('nav logout clears the local queue and survives storage exceptions', async (page) => {
  await mountRealPart(page, {
    partName: 'nav-controls',
    id: 'nav-controls',
    state: navState(),
  });
  await page.evaluate(() => {
    localStorage.setItem('vidium:media-queue:v1', '[]');
    document.addEventListener('submit', (event) => event.preventDefault(), { once: true });
    document
      .querySelector('[data-action="logout"]')
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.evaluate(() => localStorage.getItem('vidium:media-queue:v1')), null);

  await page.evaluate(() => {
    const part = window.__VIDIUM_TEST__.instances['nav-controls'];
    part.state.loggingOut = false;
    localStorage.setItem('vidium:media-queue:v1', '[]');
    window.__removeAttempts = 0;
    document.addEventListener('submit', (event) => event.preventDefault(), { once: true });
    Object.defineProperty(Storage.prototype, 'removeItem', {
      configurable: true,
      value() {
        window.__removeAttempts += 1;
        throw new DOMException('denied');
      },
    });
    document
      .querySelector('[data-action="logout"]')
      .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  assert.equal((await partState(page, 'nav-controls')).loggingOut, true);
  assert.equal(await page.evaluate(() => window.__removeAttempts), 1);
});

browserTest(
  'feed card pager loads pages, pushes history, handles popstate, and rerenders pagination',
  async (page) => {
    await page.route('**/api/feed/cards?*', async (route) => {
      const url = new URL(route.request().url());
      const requestedPage = Number(url.searchParams.get('page'));
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          cards: [
            card({
              uid: requestedPage === 1 ? UID_ONE : UID_TWO,
              title: `Page ${requestedPage}`,
            }),
          ],
          page: requestedPage,
          pageSize: 1,
          pageCount: 3,
          total: 3,
        },
      });
    });
    await mountRealPart(page, {
      partName: 'feed-card-pager',
      id: 'feed-card-pager',
      state: feedPagerState(),
    });

    await page.locator('.feed-pager-page[data-page="2"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].state.page === 2,
    );
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    assert.equal(await page.locator('.card-title-text').textContent(), 'Page 2');
    assert.equal(await page.locator('[data-ref="status"]').textContent(), '2-2 of 3');
    assert.match(
      await page.locator('.feed-pager-page[data-page="2"]').getAttribute('class'),
      /active/,
    );

    await page.goBack();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].state.page === 1,
    );
    assert.equal(new URL(page.url()).searchParams.has('page'), false);
    assert.equal(await page.locator('.card-title-text').textContent(), 'Page 1');
  },
);

browserTest(
  'feed card pager aborts the previous page request when a new navigation starts',
  async (page) => {
    let releaseSecond;
    let secondStarted = false;
    await page.route('**/api/feed/cards?*', async (route) => {
      const requestedPage = Number(new URL(route.request().url()).searchParams.get('page'));
      if (requestedPage === 2) {
        secondStarted = true;
        await new Promise((resolve) => {
          releaseSecond = resolve;
        });
      }
      await route
        .fulfill({
          status: 200,
          json: {
            ok: true,
            cards: [
              card({
                uid: requestedPage === 2 ? UID_ONE : UID_TWO,
                title: `Page ${requestedPage}`,
              }),
            ],
            page: requestedPage,
            pageSize: 1,
            pageCount: 3,
            total: 3,
          },
        })
        .catch(() => {});
    });
    await mountRealPart(page, {
      partName: 'feed-card-pager',
      id: 'feed-card-pager',
      state: feedPagerState(),
    });
    await page.evaluate(() => {
      const nativeFetch = window.fetch;
      window.__abortCount = 0;
      window.fetch = (...args) => {
        args[1]?.signal?.addEventListener('abort', () => {
          window.__abortCount += 1;
        });
        return nativeFetch(...args);
      };
      history.pushState({}, '', '?page=2');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].state.loading,
    );
    await page.waitForFunction(() => window.__abortCount === 0);
    assert.equal(secondStarted, true);

    await page.evaluate(() => {
      history.pushState({}, '', '?page=3');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(() => window.__abortCount === 1);
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].state.page === 3,
    );
    releaseSecond();
    assert.equal((await partState(page, 'feed-card-pager')).page, 3);
  },
);

browserTest('feed card pager exposes error state for HTTP and JSON failures', async (page) => {
  let calls = 0;
  await page.route('**/api/feed/cards?*', async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 500, json: { ok: false, error: 'failed' } });
    } else {
      await route.fulfill({ status: 200, body: '{invalid json', contentType: 'application/json' });
    }
  });
  await mountRealPart(page, {
    partName: 'feed-card-pager',
    id: 'feed-card-pager',
    state: feedPagerState(),
  });

  await page.locator('.feed-pager-page[data-page="2"]').click();
  await page.waitForFunction(
    () => window.__VIDIUM_TEST__.instances['feed-card-pager'].state.error === 'Request failed',
  );
  assert.equal(await page.locator('[data-ref="message"]').textContent(), 'Request failed');

  await page.locator('.feed-pager-page[data-page="2"]').click();
  await page.waitForFunction(
    () => window.__VIDIUM_TEST__.instances['feed-card-pager'].state.loading === false,
  );
  assert.equal(calls, 2);
  assert.equal((await partState(page, 'feed-card-pager')).error, 'Request failed');
});

browserTest('feed card download patches the card, local queue, and polling ids', async (page) => {
  await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
  await page.route('**/api/download', (route) =>
    route.fulfill({ status: 200, json: { ok: true, status: 'queued' } }),
  );
  await mountRealPart(page, {
    partName: 'feed-card-pager',
    id: 'feed-card-pager',
    state: feedPagerState(),
  });
  await page.evaluate(() => {
    window.__queueEvents = 0;
    addEventListener('vidium:media-queue-item-added', () => {
      window.__queueEvents += 1;
    });
  });

  await page.locator(`[data-action="download"][data-id="${UID_ONE}"][data-type="video"]`).click();
  await page.waitForFunction(() =>
    window.__VIDIUM_TEST__.instances['feed-card-pager'].state.pollingIds.includes(
      'video_uid_0000001',
    ),
  );
  const result = await page.evaluate(() => ({
    state: window.__VIDIUM_TEST__.instances['feed-card-pager'].state,
    stored: JSON.parse(localStorage.getItem('vidium:media-queue:v1')),
    events: window.__queueEvents,
  }));
  assert.equal(result.state.cards[0].videoStatus, 'queued');
  assert.deepEqual(result.state.pollingIds, [UID_ONE]);
  assert.equal(result.state.localQueueItems[0].uid, UID_ONE);
  assert.equal(result.stored[0].status, 'queued');
  assert.equal(result.events, 1);
  assert.equal(await page.locator(`[data-id="${UID_ONE}"] .btn-pending`).textContent(), 'Queued');
});

browserTest(
  'feed polling patches backing cards and replaces only the affected card',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    await page.route('**/api/status?*', (route) =>
      route.fulfill({
        status: 200,
        json: {
          [UID_ONE]: { video: 'ready', audio: 'none' },
        },
      }),
    );
    await mountRealPart(page, {
      partName: 'feed-card-pager',
      id: 'feed-card-pager',
      state: feedPagerState({
        cards: [card({ videoStatus: 'queued' }), card({ uid: UID_TWO, title: 'Second video' })],
        total: 2,
        pageSize: 2,
      }),
    });
    await page.evaluate(() => {
      window.__firstCard = document.querySelector(`[data-id="${'video_uid_0000001'}"]`);
      window.__secondCard = document.querySelector(`[data-id="${'video_uid_0000002'}"]`);
    });
    await page.clock.runFor(0);
    await page.waitForFunction(
      () =>
        window.__VIDIUM_TEST__.instances['feed-card-pager'].state.cards[0].videoStatus === 'ready',
    );
    const result = await page.evaluate(() => ({
      firstReplaced: window.__firstCard !== document.querySelector('[data-id="video_uid_0000001"]'),
      secondPreserved:
        window.__secondCard === document.querySelector('[data-id="video_uid_0000002"]'),
      pollingIds: window.__VIDIUM_TEST__.instances['feed-card-pager'].state.pollingIds,
    }));
    assert.deepEqual(result, { firstReplaced: true, secondPreserved: true, pollingIds: [] });
  },
);

browserTest(
  'feed polling retries transient failures and logs only once per failure streak',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    let calls = 0;
    await page.route('**/api/status?*', async (route) => {
      calls += 1;
      if (calls < 3) await route.fulfill({ status: 503, json: { error: 'temporary' } });
      else {
        await route.fulfill({
          status: 200,
          json: { [UID_ONE]: { video: 'ready', audio: 'none' } },
        });
      }
    });
    await mountRealPart(page, {
      partName: 'feed-card-pager',
      id: 'feed-card-pager',
      state: feedPagerState({ cards: [card({ videoStatus: 'queued' })] }),
    });

    await page.clock.runFor(0);
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].private.pollErrorReported,
    );
    await page.clock.runFor(5000);
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].private.pollAbort === null,
    );
    assert.equal(calls, 2);
    assert.equal(
      warnings.filter((value) => value.includes('Feed status polling failed')).length,
      1,
    );
    await page.clock.runFor(5000);
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].state.pollingIds.length === 0,
    );
    assert.equal(calls, 3);
  },
);

browserTest(
  'feed pager destroy aborts page and polling fetches and blocks late updates',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    let releasePage;
    let releaseStatus;
    let pageStarted = false;
    let statusStarted = false;
    await page.route('**/api/feed/cards?*', async (route) => {
      pageStarted = true;
      await new Promise((resolve) => {
        releasePage = resolve;
      });
      await route
        .fulfill({
          status: 200,
          json: {
            ok: true,
            cards: [card({ uid: UID_TWO, title: 'Late page' })],
            page: 2,
            pageSize: 1,
            pageCount: 3,
            total: 3,
          },
        })
        .catch(() => {});
    });
    await page.route('**/api/status?*', async (route) => {
      statusStarted = true;
      await new Promise((resolve) => {
        releaseStatus = resolve;
      });
      await route
        .fulfill({
          status: 200,
          json: { [UID_ONE]: { video: 'ready', audio: 'none' } },
        })
        .catch(() => {});
    });
    await mountRealPart(page, {
      partName: 'feed-card-pager',
      id: 'feed-card-pager',
      state: feedPagerState({ cards: [card({ videoStatus: 'queued' })] }),
    });
    await page.clock.runFor(0);
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].private.pollAbort,
    );
    await page.evaluate(() => {
      history.pushState({}, '', '?page=2');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['feed-card-pager'].private.pageAbort,
    );
    assert.equal(pageStarted, true);
    assert.equal(statusStarted, true);

    await page.evaluate(() => {
      const part = window.__VIDIUM_TEST__.instances['feed-card-pager'];
      window.__pageSignal = part.private.pageAbort.signal;
      window.__pollSignal = part.private.pollAbort.signal;
    });
    await destroyPart(page, 'feed-card-pager');
    assert.deepEqual(
      await page.evaluate(() => ({
        pageAborted: window.__pageSignal.aborted,
        pollAborted: window.__pollSignal.aborted,
      })),
      { pageAborted: true, pollAborted: true },
    );
    releasePage();
    releaseStatus();
    await page.clock.runFor(15000);
    const state = await partState(page, 'feed-card-pager');
    assert.equal(state.page, 1);
    assert.equal(state.cards[0].videoStatus, 'queued');
    assert.equal(await page.locator('.feed-card-pager').count(), 0);
  },
);

browserTest(
  'admin channel flags keep backing channels and pending DOM in sync on success and failure',
  async (page) => {
    let releaseAuto;
    await page.route('**/api/channel/auto-download', async (route) => {
      await new Promise((resolve) => {
        releaseAuto = resolve;
      });
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.route('**/api/channel/guest-visible', (route) =>
      route.fulfill({ status: 500, json: { ok: false, error: 'Guest flag failed' } }),
    );
    await page.route('**/api/channel/rss-enabled', (route) =>
      route.fulfill({ status: 200, json: { ok: true } }),
    );
    const alerts = [];
    page.on('dialog', async (dialog) => {
      alerts.push(dialog.message());
      await dialog.accept();
    });
    await mountRealPart(page, {
      partName: 'admin-page',
      id: 'admin-page',
      state: adminState(),
    });

    const autoVideo = page.locator(
      '[data-action="admin-channel-auto-download"][data-media-type="video"]',
    );
    await autoVideo.click();
    await page.waitForFunction(
      () =>
        window.__VIDIUM_TEST__.instances['admin-page'].state.pendingChannelAutoDownloadKey ===
        '2:video',
    );
    assert.equal((await partState(page, 'admin-page')).channels[0].autoDownloadVideo, true);
    assert.equal(await autoVideo.isDisabled(), true);
    releaseAuto();
    await page.waitForFunction(
      () =>
        window.__VIDIUM_TEST__.instances['admin-page'].state.pendingChannelAutoDownloadKey === '',
    );
    assert.equal(await autoVideo.isEnabled(), true);
    assert.equal(await autoVideo.isChecked(), true);

    const guest = page.locator('[data-action="admin-channel-guest-visible"]');
    await guest.click();
    await page.waitForFunction(
      () =>
        window.__VIDIUM_TEST__.instances['admin-page'].state.errorMessage === 'Guest flag failed',
    );
    assert.equal((await partState(page, 'admin-page')).channels[0].guestVisible, false);
    assert.equal(await guest.isChecked(), false);
    assert.deepEqual(alerts, ['Guest flag failed']);

    const rss = page.locator('[data-action="admin-channel-rss"]');
    await rss.click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.pendingChannelRssId === 0,
    );
    assert.equal((await partState(page, 'admin-page')).channels[0].rssEnabled, false);
    assert.equal(await rss.isChecked(), false);
  },
);

browserTest(
  'admin delete and reset actions patch collections, DOM, summaries, and pending buttons',
  async (page) => {
    let releaseDelete;
    await page.route('**/api/admin/video/delete', async (route) => {
      await new Promise((resolve) => {
        releaseDelete = resolve;
      });
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.route('**/api/admin/video/files/delete', (route) =>
      route.fulfill({ status: 500, json: { ok: false, error: 'Files failed' } }),
    );
    await page.route('**/api/admin/job/delete', (route) =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          resetStatus: { youtubeId: 'yt-one', statusType: 'video' },
        },
      }),
    );
    await page.route('**/api/admin/video/status/reset', (route) =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          resetStatus: { youtubeId: 'yt-two', resetVideo: true, resetAudio: true },
        },
      }),
    );
    const alerts = [];
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'confirm') await dialog.accept();
      else {
        alerts.push(dialog.message());
        await dialog.accept();
      }
    });
    const secondProblem = {
      youtubeId: 'yt-two',
      title: 'Second problem',
      videoStatus: 'downloading',
      audioStatus: 'queued',
      readyAt: '',
      createdAt: '2026-08-15',
    };
    await mountRealPart(page, {
      partName: 'admin-page',
      id: 'admin-page',
      state: adminState({
        jobs: [
          adminState().jobs[0],
          { ...adminState().jobs[0], id: 11, youtubeId: 'yt-two', type: 'download_audio' },
        ],
        problemRows: [adminState().problemRows[0], secondProblem],
        statusSummary: [
          { status: 'none', videoCount: 0, audioCount: 0 },
          { status: 'queued', videoCount: 1, audioCount: 1 },
          { status: 'downloading', videoCount: 1, audioCount: 0 },
          { status: 'ready', videoCount: 0, audioCount: 1 },
        ],
      }),
    });

    const deleteVideo = page.locator('[data-action="admin-delete-video"]');
    await deleteVideo.click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.pendingAction?.action === 'video',
    );
    assert.equal(await deleteVideo.isDisabled(), true);
    assert.equal(await deleteVideo.textContent(), 'Deleting');
    releaseDelete();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.downloadedVideos.length === 0,
    );
    assert.equal(await page.locator('[data-video-row="yt-ready"]').count(), 0);

    const deleteFilesState = adminState().downloadedVideos[0];
    await page.evaluate((row) => {
      window.__VIDIUM_TEST__.instances['admin-page'].set('downloadedVideos', [row]);
    }, deleteFilesState);
    await page.locator('[data-action="admin-delete-files"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.errorMessage === 'Files failed',
    );
    assert.deepEqual(alerts, ['Files failed']);

    await page.locator('[data-action="admin-delete-job"][data-job-id="10"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.jobs.length === 1,
    );
    let state = await partState(page, 'admin-page');
    assert.equal(
      state.problemRows.some((row) => row.youtubeId === 'yt-one'),
      false,
    );
    assert.equal(state.statusSummary.find((row) => row.status === 'queued').videoCount, 0);
    assert.equal(state.statusSummary.find((row) => row.status === 'none').videoCount, 1);

    await page
      .locator('[data-action="admin-reset-video-status"][data-youtube-id="yt-two"]')
      .click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.problemRows.length === 0,
    );
    state = await partState(page, 'admin-page');
    assert.equal(state.jobs.length, 0);
    assert.equal(state.statusSummary.find((row) => row.status === 'none').videoCount, 2);
    assert.equal(state.statusSummary.find((row) => row.status === 'none').audioCount, 1);
  },
);

browserTest(
  'admin user role keeps pending controls and rolls back a failed update',
  async (page) => {
    let calls = 0;
    let releaseSuccess;
    await page.route('**/api/admin/user/role', async (route) => {
      calls += 1;
      if (calls === 1) {
        await new Promise((resolve) => {
          releaseSuccess = resolve;
        });
        await route.fulfill({ status: 200, json: { ok: true } });
      } else {
        await route.fulfill({ status: 403, json: { ok: false, error: 'Role denied' } });
      }
    });
    const alerts = [];
    page.on('dialog', async (dialog) => {
      alerts.push(dialog.message());
      await dialog.accept();
    });
    await mountRealPart(page, {
      partName: 'admin-page',
      id: 'admin-page',
      state: adminState(),
    });
    const role = page.locator('[data-action="admin-user-role"][data-user-id="2"]');
    await role.click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.pendingUserRoleId === 2,
    );
    assert.equal(await role.isDisabled(), true);
    assert.equal((await partState(page, 'admin-page')).users[1].role, 'admin');
    releaseSuccess();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.pendingUserRoleId === 0,
    );
    assert.equal(await role.isChecked(), true);

    await role.click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['admin-page'].state.errorMessage === 'Role denied',
    );
    assert.equal((await partState(page, 'admin-page')).users[1].role, 'admin');
    assert.equal(await role.isChecked(), true);
    assert.deepEqual(alerts, ['Role denied']);
  },
);

browserTest(
  'media queue reads, normalizes, removes, and clears valid localStorage items',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    await page.evaluate(
      ({ first, second }) => {
        localStorage.setItem(
          'vidium:media-queue:v1',
          JSON.stringify([
            { uid: first, type: 'video', title: 'Older', status: 'queued', addedAt: 10 },
            { uid: first, type: 'video', title: 'Newest', status: 'downloading', addedAt: 30 },
            { uid: second, type: 'audio', title: 'Second', status: 'ready', addedAt: 20 },
            { uid: 'bad', type: 'audio' },
          ]),
        );
      },
      { first: UID_ONE, second: UID_TWO },
    );
    await mountRealPart(page, {
      partName: 'media-queue',
      id: 'media-queue',
      state: mediaQueueState(),
    });
    await page.locator('[data-action="open"]').click();
    const opened = await partState(page, 'media-queue');
    assert.deepEqual(
      opened.items.map((item) => [item.uid, item.title, item.status]),
      [
        [UID_ONE, 'Newest', 'downloading'],
        [UID_TWO, 'Second', 'ready'],
      ],
    );
    assert.equal(await page.locator('.media-queue-row').count(), 2);

    await page.locator(`[data-action="remove"][data-uid="${UID_ONE}"]`).click();
    assert.deepEqual(
      (await partState(page, 'media-queue')).items.map((item) => item.uid),
      [UID_TWO],
    );
    await page.locator(`[data-action="remove"][data-uid="${UID_TWO}"]`).click();
    assert.equal((await partState(page, 'media-queue')).items.length, 0);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('vidium:media-queue:v1'))),
      [],
    );
    assert.equal((await page.locator('[data-ref="items"]').textContent()).trim(), 'Queue is empty');
  },
);

browserTest(
  'media queue tolerates corrupt localStorage and reports storage access failure',
  async (page) => {
    await page.evaluate(() => localStorage.setItem('vidium:media-queue:v1', '{broken'));
    await mountRealPart(page, {
      partName: 'media-queue',
      id: 'media-queue',
      state: mediaQueueState(),
    });
    await page.locator('[data-action="open"]').click();
    assert.equal((await partState(page, 'media-queue')).items.length, 0);
    assert.equal((await partState(page, 'media-queue')).storageError, false);

    await page.locator('[data-action="close"]').click();
    await page.evaluate(() => {
      Object.defineProperty(Storage.prototype, 'getItem', {
        configurable: true,
        value() {
          throw new DOMException('denied');
        },
      });
    });
    await page.locator('[data-action="open"]').click();
    assert.equal((await partState(page, 'media-queue')).storageError, true);
    assert.match(await page.locator('[data-ref="items"]').textContent(), /Storage error/);
  },
);

browserTest('media queue item-added hint uses clock and listener cleanup', async (page) => {
  await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
  await mountRealPart(page, {
    partName: 'media-queue',
    id: 'media-queue',
    state: mediaQueueState(),
  });
  await page.evaluate(() => dispatchEvent(new CustomEvent('vidium:media-queue-item-added')));
  assert.equal((await partState(page, 'media-queue')).queueHintActive, true);
  assert.match(await page.locator('[data-ref="openButton"]').getAttribute('class'), /hint/);
  await page.clock.runFor(5000);
  assert.equal((await partState(page, 'media-queue')).queueHintActive, false);

  await page.locator('[data-action="open"]').click();
  await page.locator('[data-action="close"]').click();
  await page.evaluate(() => dispatchEvent(new CustomEvent('vidium:media-queue-item-added')));
  assert.equal((await partState(page, 'media-queue')).queueHintActive, false);

  await destroyPart(page, 'media-queue');
  await page.evaluate(() => {
    window.__VIDIUM_TEST__.instances['media-queue'].state.queueHintActive = false;
    dispatchEvent(new CustomEvent('vidium:media-queue-item-added'));
  });
  assert.equal((await partState(page, 'media-queue')).queueHintActive, false);
});

browserTest(
  'media queue polling updates status and destroy aborts polling and timers',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    await page.evaluate((uid) => {
      localStorage.setItem(
        'vidium:media-queue:v1',
        JSON.stringify([{ uid, type: 'video', title: 'Queued', status: 'queued', addedAt: 1 }]),
      );
    }, UID_ONE);
    let calls = 0;
    let releasePending;
    await page.route('**/api/status?*', async (route) => {
      calls += 1;
      if (calls === 1) {
        await route.fulfill({
          status: 200,
          json: { [UID_ONE]: { video: 'ready', audio: 'none' } },
        });
        return;
      }
      await new Promise((resolve) => {
        releasePending = resolve;
      });
      await route
        .fulfill({
          status: 200,
          json: { [UID_ONE]: { video: 'ready', audio: 'none' } },
        })
        .catch(() => {});
    });
    await mountRealPart(page, {
      partName: 'media-queue',
      id: 'media-queue',
      state: mediaQueueState(),
    });
    await page.locator('[data-action="open"]').click();
    await page.clock.runFor(0);
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['media-queue'].state.items[0].status === 'ready',
    );
    assert.match(await page.locator('.media-queue-status').textContent(), /Ready/);
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('vidium:media-queue:v1'))[0].status,
      ),
      'ready',
    );

    await page.evaluate(() => {
      const part = window.__VIDIUM_TEST__.instances['media-queue'];
      part.set('items', [{ ...part.state.items[0], status: 'queued' }]);
      part.set('open', false);
      part.set('open', true);
    });
    await page.clock.runFor(0);
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['media-queue'].private.pollAbort,
    );
    await page.evaluate(() => {
      window.__mediaQueuePollSignal =
        window.__VIDIUM_TEST__.instances['media-queue'].private.pollAbort.signal;
    });
    await destroyPart(page, 'media-queue');
    assert.equal(await page.evaluate(() => window.__mediaQueuePollSignal.aborted), true);
    releasePending();
    await page.clock.runFor(10000);
    assert.equal((await partState(page, 'media-queue')).items[0].status, 'queued');
    assert.equal(await page.locator('.media-queue').count(), 0);
  },
);

async function mockPlayerMedia(page, id, values = {}) {
  await page.evaluate(
    ({ instanceId, initial }) => {
      const media = window.__VIDIUM_TEST__.instances[instanceId].refs.media;
      let currentTime = initial.currentTime ?? 0;
      let duration = initial.duration ?? 1800;
      let paused = initial.paused ?? true;
      let playbackRate = 1;
      window.__mediaCalls = { play: 0, pause: 0 };
      Object.defineProperties(media, {
        currentTime: {
          configurable: true,
          get: () => currentTime,
          set: (value) => {
            currentTime = Number(value);
          },
        },
        duration: {
          configurable: true,
          get: () => duration,
          set: (value) => {
            duration = Number(value);
          },
        },
        paused: {
          configurable: true,
          get: () => paused,
        },
        playbackRate: {
          configurable: true,
          get: () => playbackRate,
          set: (value) => {
            playbackRate = Number(value);
          },
        },
      });
      media.play = async () => {
        window.__mediaCalls.play += 1;
        paused = false;
        media.dispatchEvent(new Event('play'));
      };
      media.pause = () => {
        window.__mediaCalls.pause += 1;
        paused = true;
        media.dispatchEvent(new Event('pause'));
      };
      window.__setMedia = (next) => {
        if ('currentTime' in next) currentTime = Number(next.currentTime);
        if ('duration' in next) duration = Number(next.duration);
        if ('paused' in next) paused = Boolean(next.paused);
      };
    },
    { instanceId: id, initial: values },
  );
}

browserTest('player resumes only inside valid bounds and drops stale progress', async (page) => {
  const now = new Date('2026-08-16T12:00:00Z');
  await page.clock.install({ time: now });
  const state = playerState();
  await page.evaluate(
    ({ key, updatedAt }) => {
      localStorage.setItem(key, JSON.stringify({ time: 120, updatedAt }));
    },
    { key: state.resumeKey, updatedAt: now.getTime() },
  );
  await mountRealPart(page, {
    partName: 'player-page',
    id: 'player-page',
    state,
  });
  await mockPlayerMedia(page, 'player-page', { duration: 1800, currentTime: 0 });
  await page.locator('[data-ref="media"]').dispatchEvent('loadedmetadata');
  assert.equal(
    await page.evaluate(
      () => window.__VIDIUM_TEST__.instances['player-page'].refs.media.currentTime,
    ),
    120,
  );

  const bounds = await page.evaluate(
    ({ key, nowMs }) => {
      const part = window.__VIDIUM_TEST__.instances['player-page'];
      const media = part.refs.media;
      const results = {};

      window.__setMedia({ currentTime: 0, duration: 1800 });
      localStorage.setItem(key, JSON.stringify({ time: 4, updatedAt: nowMs }));
      part.private.restore();
      results.belowMinimum = media.currentTime;

      window.__setMedia({ currentTime: 0, duration: 1800 });
      localStorage.setItem(key, JSON.stringify({ time: 1795, updatedAt: nowMs }));
      part.private.restore();
      results.nearEnd = media.currentTime;
      results.nearEndRemoved = localStorage.getItem(key) === null;

      window.__setMedia({ currentTime: 0, duration: 1800 });
      localStorage.setItem(
        key,
        JSON.stringify({ time: 300, updatedAt: nowMs - 31 * 24 * 60 * 60 * 1000 }),
      );
      part.private.restore();
      results.stale = media.currentTime;
      results.staleRemoved = localStorage.getItem(key) === null;
      return results;
    },
    { key: state.resumeKey, nowMs: now.getTime() },
  );
  assert.deepEqual(bounds, {
    belowMinimum: 0,
    nearEnd: 0,
    nearEndRemoved: true,
    stale: 0,
    staleRemoved: true,
  });
});

browserTest('player saves and clears progress while respecting end margin', async (page) => {
  await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
  const state = playerState();
  await mountRealPart(page, {
    partName: 'player-page',
    id: 'player-page',
    state,
  });
  await mockPlayerMedia(page, 'player-page', { duration: 1800, currentTime: 100 });
  await page.clock.runFor(5000);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    state.resumeKey,
  );
  assert.equal(saved.time, 100);
  assert.equal(Number.isFinite(saved.updatedAt), true);

  await page.locator('[data-ref="media"]').dispatchEvent('ended');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), state.resumeKey), null);

  await page.evaluate(() => window.__setMedia({ currentTime: 1795 }));
  await page.clock.runFor(5000);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), state.resumeKey), null);
});

browserTest(
  'player supports relative and chapter seek and updates the active chapter',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    await page.route('**/api/play', (route) => route.fulfill({ status: 200, json: { ok: true } }));
    await mountRealPart(page, {
      partName: 'player-page',
      id: 'player-page',
      state: playerState(),
    });
    await mockPlayerMedia(page, 'player-page', { currentTime: 100, duration: 1800 });
    await page.locator('[data-action="seek"][data-seek="15"]').click();
    assert.equal(
      await page.evaluate(
        () => window.__VIDIUM_TEST__.instances['player-page'].refs.media.currentTime,
      ),
      115,
    );

    await page.evaluate(() => window.__setMedia({ currentTime: 10 }));
    await page.locator('[data-action="seek"][data-seek="-30"]').click();
    assert.equal(
      await page.evaluate(
        () => window.__VIDIUM_TEST__.instances['player-page'].refs.media.currentTime,
      ),
      0,
    );

    await page.locator('[data-action="chapter-seek"][data-chapter-start="60"]').click();
    assert.equal(
      await page.evaluate(
        () => window.__VIDIUM_TEST__.instances['player-page'].refs.media.currentTime,
      ),
      60,
    );
    assert.equal((await partState(page, 'player-page')).activeChapterStart, 60);
    assert.match(
      await page
        .locator('[data-action="chapter-seek"][data-chapter-start="60"]')
        .getAttribute('class'),
      /is-active/,
    );
  },
);

browserTest(
  'player playback rate and play/pause events synchronize state and DOM',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    await page.route('**/api/play', (route) => route.fulfill({ status: 200, json: { ok: true } }));
    await mountRealPart(page, {
      partName: 'player-page',
      id: 'player-page',
      state: playerState(),
    });
    await mockPlayerMedia(page, 'player-page', { paused: true });
    await page.locator('[data-action="toggle-rate"]').click();
    assert.equal((await partState(page, 'player-page')).playbackRate, 1.25);
    assert.equal(
      await page.evaluate(
        () => window.__VIDIUM_TEST__.instances['player-page'].refs.media.playbackRate,
      ),
      1.25,
    );
    assert.match(await page.locator('[data-ref="rateButton"]').getAttribute('class'), /is-active/);

    await page.locator('[data-action="toggle-play"]').click();
    assert.equal((await partState(page, 'player-page')).paused, false);
    assert.doesNotMatch(
      await page.locator('[data-ref="playButton"]').getAttribute('class'),
      /is-paused/,
    );
    await page.locator('[data-action="toggle-play"]').click();
    assert.equal((await partState(page, 'player-page')).paused, true);
    assert.match(await page.locator('[data-ref="playButton"]').getAttribute('class'), /is-paused/);
  },
);

browserTest('player records the first play event only once', async (page) => {
  await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
  let playRequests = 0;
  await page.route('**/api/play', async (route) => {
    playRequests += 1;
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await mountRealPart(page, {
    partName: 'player-page',
    id: 'player-page',
    state: playerState(),
  });
  await mockPlayerMedia(page, 'player-page', { paused: true });
  await page.evaluate(() => {
    const media = window.__VIDIUM_TEST__.instances['player-page'].refs.media;
    media.dispatchEvent(new Event('play'));
    media.dispatchEvent(new Event('pause'));
    media.dispatchEvent(new Event('play'));
  });
  await page.waitForFunction(
    () => window.__VIDIUM_TEST__.instances['player-page'].private.playRecorded,
  );
  assert.equal(playRequests, 1);
});

browserTest(
  'player share and clipboard handle success, rejection, and late completion after destroy',
  async (page) => {
    await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
    await mountRealPart(page, {
      partName: 'player-page',
      id: 'player-page',
      state: playerState(),
    });
    await page.evaluate(() => {
      window.__shareCalls = 0;
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          window.__shareCalls += 1;
        },
      });
    });
    await page.locator('[data-action="share"]').click();
    await page.waitForFunction(() => window.__shareCalls === 1);
    assert.equal((await partState(page, 'player-page')).shareStatus, 'idle');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          throw new Error('cancelled');
        },
      });
    });
    await page.locator('[data-action="share"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['player-page'].state.shareStatus === 'idle',
    );

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => {} },
      });
    });
    await page.locator('[data-action="share"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['player-page'].state.shareStatus === 'copied',
    );
    assert.match(
      await page.locator('[data-ref="shareButton"]').getAttribute('class'),
      /is-success/,
    );
    await page.clock.runFor(500);
    assert.equal((await partState(page, 'player-page')).shareStatus, 'idle');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('denied');
          },
        },
      });
    });
    await page.locator('[data-action="share"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['player-page'].state.shareStatus === 'idle',
    );

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            new Promise((resolve) => {
              window.__resolveClipboard = resolve;
            }),
        },
      });
    });
    await page.locator('[data-action="share"]').click();
    await page.waitForFunction(
      () => window.__VIDIUM_TEST__.instances['player-page'].state.shareStatus === 'copying',
    );
    await destroyPart(page, 'player-page');
    await page.evaluate(() => window.__resolveClipboard());
    await page.evaluate(() => Promise.resolve());
    assert.equal((await partState(page, 'player-page')).shareStatus, 'copying');
  },
);

browserTest('player sleep timer counts down and pauses media at expiry', async (page) => {
  await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
  await mountRealPart(page, {
    partName: 'player-page',
    id: 'player-page',
    state: playerState({
      mediaDurationSeconds: 10,
      sleepDurationSeconds: 3,
      sleepRemainingSeconds: 3,
    }),
  });
  await mockPlayerMedia(page, 'player-page', { paused: false, duration: 10 });
  await page.locator('[data-action="sleep"]').click();
  assert.equal((await partState(page, 'player-page')).sleepDeadline > 0, true);
  assert.match(await page.locator('[data-ref="sleepButton"]').getAttribute('class'), /is-active/);
  for (let step = 0; step < 6; step += 1) {
    if ((await partState(page, 'player-page')).sleepRemainingSeconds === 0) break;
    await page.clock.runFor(1001);
  }
  const result = await page.evaluate(() => ({
    state: window.__VIDIUM_TEST__.instances['player-page'].state,
    calls: window.__mediaCalls,
  }));
  assert.equal(result.state.sleepRemainingSeconds, 0);
  assert.equal(result.state.sleepDeadline, 0);
  assert.equal(result.calls.pause, 1);
  assert.equal((await page.locator('[data-ref="sleepCountdown"]').textContent()).trim(), '0:00');
});

browserTest('player destroy removes media listeners and all timers', async (page) => {
  await page.clock.install({ time: new Date('2026-08-16T12:00:00Z') });
  let playRequests = 0;
  await page.route('**/api/play', (route) => {
    playRequests += 1;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  const state = playerState();
  await mountRealPart(page, {
    partName: 'player-page',
    id: 'player-page',
    state,
  });
  await mockPlayerMedia(page, 'player-page', { paused: true, currentTime: 100, duration: 1800 });
  await destroyPart(page, 'player-page');
  await page.evaluate((key) => {
    const part = window.__VIDIUM_TEST__.instances['player-page'];
    part.state.paused = true;
    localStorage.setItem(key, 'sentinel');
    part.refs.media.dispatchEvent(new Event('play'));
    part.refs.media.dispatchEvent(new Event('pause'));
    part.refs.media.dispatchEvent(new Event('loadedmetadata'));
    part.refs.media.dispatchEvent(new Event('ended'));
  }, state.resumeKey);
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), state.resumeKey),
    'sentinel',
  );
  await page.clock.runFor(15000);
  assert.equal(playRequests, 0);
  assert.equal((await partState(page, 'player-page')).paused, true);
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), state.resumeKey),
    'sentinel',
  );
  assert.equal(await page.locator('.player').count(), 0);
});

browserTest(
  'back-top follows scroll state, scrolls to top, and removes its listener',
  async (page) => {
    await page.evaluate(() => {
      let scrollY = 0;
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        get: () => scrollY,
      });
      window.__setScrollY = (value) => {
        scrollY = value;
      };
      window.__scrollCalls = [];
      window.scrollTo = (options) => window.__scrollCalls.push(options);
    });
    await mountRealPart(page, {
      partName: 'back-top',
      id: 'back-top',
      state: { visible: false, eventScrollTop: 0 },
    });
    await page.evaluate(() => {
      window.__setScrollY(500);
      dispatchEvent(new Event('scroll'));
    });
    assert.equal((await partState(page, 'back-top')).visible, true);
    assert.match(await page.locator('[data-ref="button"]').getAttribute('class'), /visible/);
    await page.locator('[data-action="top"]').click();
    assert.deepEqual(await page.evaluate(() => window.__scrollCalls), [
      { top: 0, behavior: 'smooth' },
    ]);

    await destroyPart(page, 'back-top');
    await page.evaluate(() => {
      const part = window.__VIDIUM_TEST__.instances['back-top'];
      part.state.visible = false;
      window.__setScrollY(600);
      dispatchEvent(new Event('scroll'));
    });
    assert.equal((await partState(page, 'back-top')).visible, false);
  },
);
