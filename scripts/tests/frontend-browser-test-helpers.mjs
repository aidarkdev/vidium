import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const engineRoot = resolve(projectRoot, 'src/engine');
const partsRoot = resolve(projectRoot, 'src/parts');
const browserPartFiles = new Set(['index.js', 'template.js', 'handlers.js']);
const chromiumCandidates = [
  process.env.VIDIUM_CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

function safelyInside(root, target) {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith('../') && !path.startsWith('..\\');
}

function decodeRequestPath(rawUrl) {
  const rawPath = String(rawUrl || '/').split(/[?#]/, 1)[0];
  let path;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return { error: 400 };
  }

  if (path.includes('\0') || path.includes('\\')) return { error: 403 };
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    return { error: 403 };
  }
  return { path };
}

function resolveBrowserModule(path) {
  if (path.startsWith('/engine/')) {
    const segments = path.slice('/engine/'.length).split('/');
    if (!segments.length || segments.some((segment) => !segment) || !path.endsWith('.js')) {
      return null;
    }
    const target = resolve(engineRoot, ...segments);
    return safelyInside(engineRoot, target) ? target : null;
  }

  if (path.startsWith('/parts/')) {
    const segments = path.slice('/parts/'.length).split('/');
    if (segments.length !== 2 || segments.some((segment) => !segment)) return null;
    const [partName, fileName] = segments;
    if (!/^[a-z0-9-]+$/.test(partName) || !browserPartFiles.has(fileName)) return null;
    const target = resolve(partsRoot, partName, fileName);
    return safelyInside(partsRoot, target) ? target : null;
  }

  return null;
}

async function requestHandler(req, res) {
  const decoded = decodeRequestPath(req.url);
  if (decoded.error) {
    res.writeHead(decoded.error, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('rejected');
    return;
  }

  if (decoded.path === '/') {
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    });
    res.end('<!doctype html><html><head></head><body></body></html>');
    return;
  }

  const target = resolveBrowserModule(decoded.path);
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }

  try {
    const source = await readFile(target);
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/javascript; charset=utf-8',
    });
    res.end(source);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') throw error;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

async function findChromium() {
  for (const candidate of chromiumCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit system-browser location.
    }
  }
  throw new Error(
    'Chromium was not found. Set VIDIUM_CHROMIUM_PATH to a Chromium-compatible executable.',
  );
}

export async function createFrontendBrowserHarness() {
  const server = createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.message : 'fixture error');
    });
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    executablePath: await findChromium(),
    headless: true,
  });

  return {
    origin,
    async newPage(path = '/') {
      const page = await browser.newPage();
      await page.goto(`${origin}${path}`);
      return page;
    },
    async close() {
      await browser.close();
      await new Promise((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

export async function preparePage(page, baked = {}) {
  await page.evaluate((value) => {
    const current = document.getElementById('__BAKED__');
    current?.remove();
    const bakedScript = document.createElement('script');
    bakedScript.type = 'application/json';
    bakedScript.id = '__BAKED__';
    bakedScript.textContent = JSON.stringify(value);
    document.head.append(bakedScript);
  }, baked);
}

export async function mountRealPart(page, { partName, id, state, params = {} }) {
  const hasBaked = await page.locator('#__BAKED__').count();
  if (!hasBaked) await preparePage(page, { [id]: state });

  await page.evaluate(
    async ({ modulePath, instanceId, mountParams }) => {
      const anchor = document.createElement('script');
      anchor.type = 'application/json';
      anchor.setAttribute('mount-dot', `mount-dot-${instanceId}`);
      document.body.append(anchor);
      const [{ default: partModule }, engine] = await Promise.all([
        import(modulePath),
        import('/engine/core.js'),
      ]);
      const instance = engine.mount(partModule, { id: instanceId, ...mountParams });
      window.__VIDIUM_TEST__ ??= { instances: {}, modules: {}, engine };
      window.__VIDIUM_TEST__.instances[instanceId] = instance;
      window.__VIDIUM_TEST__.modules[instanceId] = partModule;
    },
    { modulePath: `/parts/${partName}/index.js`, instanceId: id, mountParams: params },
  );
}

export async function destroyPart(page, id) {
  await page.evaluate((instanceId) => {
    const test = window.__VIDIUM_TEST__;
    test.engine.destroy(test.instances[instanceId]);
  }, id);
}

export async function partState(page, id) {
  return page.evaluate((instanceId) => window.__VIDIUM_TEST__.instances[instanceId].state, id);
}
