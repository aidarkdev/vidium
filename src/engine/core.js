const macroPaths = new Map();
const instanceIds = new Set();
const bakedCache = { loaded: false, value: {} };

function readBaked() {
  if (bakedCache.loaded) return bakedCache.value;
  const el = document.getElementById('__BAKED__');
  bakedCache.loaded = true;
  bakedCache.value = el?.textContent ? JSON.parse(el.textContent) : {};
  return bakedCache.value;
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: public API name required by the frontend tool spec
export function escape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseTemplate(html) {
  if (typeof html !== 'string') throw new Error('Template must return a string');
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const count = tpl.content.children.length;
  if (count !== 1) throw new Error(`Template must return exactly one root element, got ${count}`);
  return tpl.content.firstElementChild;
}

function collectRefs(root, id) {
  const refs = {};
  const nodes = [];
  if (root.hasAttribute('data-ref')) nodes.push(root);
  nodes.push(...root.querySelectorAll('[data-ref]'));
  for (const node of nodes) {
    const name = node.getAttribute('data-ref');
    if (Object.hasOwn(refs, name)) {
      throw new Error(`Duplicate data-ref="${name}" in part ${id}`);
    }
    refs[name] = node;
  }
  return refs;
}

function getEventEntries(handlers) {
  const grouped = new Map();
  for (const [key, handler] of Object.entries(handlers?.events ?? {})) {
    const space = key.indexOf(' ');
    if (space <= 0) throw new Error(`Invalid event handler key "${key}"`);
    const type = key.slice(0, space);
    const selector = key.slice(space + 1).trim();
    const entries = grouped.get(type) ?? [];
    entries.push({ selector, handler });
    grouped.set(type, entries);
  }
  return grouped;
}

function notifySubscriber(sub, newValue, oldValue) {
  sub.instance.state[sub.localName] = newValue;
  sub.instance.__handlers.state[sub.localName]?.(sub.instance, newValue, oldValue);
}

function publish(instance, field, value) {
  const path = `${instance.id}.${field}`;
  const entry = macroPaths.get(path);
  if (!entry || entry.owner !== instance) return;
  const oldValue = entry.value;
  entry.value = value;
  for (const sub of [...entry.subscribers]) notifySubscriber(sub, value, oldValue);
}

function applySet(instance, updates) {
  if (instance.__destroyed) {
    console.warn(`set called after destroy for part ${instance.id}`);
    return;
  }

  const changed = [];
  for (const [key, value] of Object.entries(updates)) {
    if (instance.__mirrorFields.has(key))
      throw new Error(`Cannot set mirror field "${key}" in part ${instance.id}`);
    const oldValue = instance.state[key];
    if (oldValue === value) continue;
    instance.state[key] = value;
    changed.push([key, value, oldValue]);
  }

  for (const [key, value] of changed) {
    if (instance.__expose.has(key)) publish(instance, key, value);
  }
  for (const [key, value, oldValue] of changed) {
    instance.__handlers.state[key]?.(instance, value, oldValue);
  }
}

function makeSet(instance) {
  return (key, value) => {
    if (typeof key === 'string') applySet(instance, { [key]: value });
    else if (key && typeof key === 'object') applySet(instance, key);
    else throw new Error('set expects a key/value or object');
  };
}

export function mount(partModule, params) {
  if (!params?.id) throw new Error('mount params.id is required');
  if (instanceIds.has(params.id)) throw new Error(`Duplicate part id ${params.id}`);
  instanceIds.add(params.id);

  const baked = readBaked();
  const state = baked[params.id] ?? params.microState;

  const handlers = partModule.handlers ?? {};
  const instance = {
    id: params.id,
    state: state ?? {},
    refs: {},
    private: {},
    templates: partModule.templates ?? { default: partModule.template },
    __handlers: handlers,
    __listeners: [],
    __subscriptions: [],
    __ownedPaths: [],
    __destroyed: false,
    __expose: new Set(params.expose ?? []),
    __mirrorFields: new Set(Object.keys(params.subscribe ?? {})),
    set: null,
  };
  instance.set = makeSet(instance);

  for (const field of instance.__expose) {
    const path = `${params.id}.${field}`;
    if (macroPaths.has(path)) throw new Error(`Duplicate MacroState owner path ${path}`);
    macroPaths.set(path, { value: instance.state[field], owner: instance, subscribers: [] });
    instance.__ownedPaths.push(path);
  }

  for (const [localName, remotePath] of Object.entries(params.subscribe ?? {})) {
    if (!handlers.state || typeof handlers.state[localName] !== 'function') {
      console.warn(`Subscription local field "${localName}" has no state handler in ${params.id}`);
      continue;
    }
    const entry = macroPaths.get(remotePath);
    if (!entry) {
      console.warn(`Subscription owner path "${remotePath}" is not registered for ${params.id}`);
      continue;
    }
    if (entry.owner === instance)
      throw new Error(`Part ${params.id} cannot subscribe to own path ${remotePath}`);
    const sub = { instance, localName, path: remotePath };
    entry.subscribers.push(sub);
    instance.__subscriptions.push(sub);
    instance.state[localName] = entry.value;
  }

  for (const field of instance.__expose) publish(instance, field, instance.state[field]);

  const root = parseTemplate(partModule.template(instance.state, instance));
  instance.root = root;
  instance.refs = collectRefs(root, params.id);

  for (const [type, entries] of getEventEntries(handlers)) {
    const listener = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      for (const entry of entries) {
        const match = target.closest(entry.selector);
        if (match && root.contains(match)) {
          entry.handler(instance, event);
          break;
        }
      }
    };
    root.addEventListener(type, listener);
    instance.__listeners.push({ type, listener });
  }

  const anchor = document.querySelector(`[mount-dot="mount-dot-${params.id}"]`) || document.currentScript;
  if (!anchor) throw new Error(`Cannot mount ${params.id}: document.currentScript is unavailable`);
  anchor.replaceWith(root);
  handlers.onMount?.(instance);
  return instance;
}

export function destroy(instance) {
  if (!instance || instance.__destroyed) {
    if (instance) console.warn(`destroy called twice for part ${instance.id}`);
    return;
  }
  instance.__destroyed = true;
  try {
    instance.__handlers.onDestroy?.(instance);
  } catch (err) {
    console.error(err);
  }
  for (const { type, listener } of instance.__listeners)
    instance.root.removeEventListener(type, listener);
  for (const sub of instance.__subscriptions) {
    const entry = macroPaths.get(sub.path);
    if (entry) entry.subscribers = entry.subscribers.filter((item) => item !== sub);
  }
  for (const path of instance.__ownedPaths) {
    const entry = macroPaths.get(path);
    if (!entry || entry.owner !== instance) continue;
    macroPaths.delete(path);
    for (const sub of [...entry.subscribers]) notifySubscriber(sub, undefined, entry.value);
  }
  instanceIds.delete(instance.id);
  instance.root?.remove();
}
