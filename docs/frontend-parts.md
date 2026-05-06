# Frontend Tool Specification

> **Purpose of this document.** Technical specification intended to brief an implementation agent. It defines the architecture, contracts between parts, runtime behavior, and the rules that implementations must follow. Sections marked **RULE**, **MUST**, **MUST NOT**, **REQUIRED**, **FORBIDDEN** are normative.

> **Reading order.** §1 (Mission) and §2 (Vocabulary) establish the philosophy and terms. §3–§9 define the core mechanics (parts, state, MacroState, lifecycle). §10–§13 cover MacroState, server-side state production, and client-side bootstrap. §14 lists every error/warn the engine must produce. §15–§17 define what the tool deliberately omits and how authors are expected to think. Server deployment and nginx/Node routing live in `docs/server-runtime.md`.

---

## 1. Mission and Philosophy

Build web pages without server-side rendered view bodies by composing reusable units called **parts**. The server handles HTTP, runs server-side bakers, and returns an HTML shell with baked JSON plus mount scripts. Page DOM is produced on the client by part templates. There is no reactivity system: DOM mutations are explicit, performed in state-handlers; lists may be re-rendered by re-invoking templates or updated with targeted state-trigger handlers.

### 1.1 Core Principles (RULES)

1. **No magic.** Every effect is the result of an explicit operation. The runtime MUST NOT infer intent, auto-track reads, or auto-clean references that the developer is responsible for cleaning.
2. **Engine is a skeleton, not a framework.** The engine provides composition primitives, lifecycle, and a coordination bus. It MUST NOT attempt to cover every UI scenario.
3. **Limits are stated, not hidden.** When the tool is unsuitable for a use case, the documentation declares this as a fact. Workarounds MUST NOT be added to ko-paint such limits.
4. **TypeScript-neutral, TypeScript-friendly.** The architecture works in plain JavaScript with runtime warnings. Adding TypeScript later strengthens it (warnings become compile-time errors) without architectural changes. Implementation MUST keep this property: no API design choice should depend on having or lacking type information.
5. **Developer responsibility over runtime safety nets.** When something can be enforced cheaply, the engine enforces it. When enforcement requires complex tracking (automatic cascade-destroy, dependency graphs, render scheduling, weak-ref bookkeeping) — the developer handles it explicitly. The default reaction to a "we could detect X" proposal is to **reject** it unless detection is cheap and unambiguous.

### 1.2 Target Use Cases (Scope)

**In scope:**
- Information pages, forms, dashboards with a bounded number of widgets
- Product/post/task pages with explicit pagination
- Admin panels, account pages
- Pages with **tens** of entities, not hundreds

**Out of scope (do not target):**
- Infinite-scroll feeds
- Chat applications with thousands of messages
- Real-time dashboards with hundreds of live widgets
- Document/spreadsheet editors with many interactive cells
- Games

The tool **encourages explicit pagination over infinite scroll**: visible scale, working browser back-button, shareable URLs, bounded cognitive load. Implementations MUST NOT add features (virtualization, viewport-based lazy mounting, streamed JSON) that primarily serve out-of-scope use cases.

---

## 2. Vocabulary

| Term | Definition |
|---|---|
| **Part** | Reusable component. Self-contained unit with client `index.js`, `template.js`, `handlers.js`, optional server-side `baker.ts`, and instance state. Multiple instances of the same part may exist on a page. |
| **Page renderer** | Server-side module under `pages/`. It calls server-side bakers, assembles baked JSON, places mount scripts, and returns an HTML string. See `docs/server-bakers.md`. |
| **Instance** | Live runtime object created by `mount(...)` from a part module and parameters. Each instance has its own `id`, `state`, `refs`, `private`, and lifecycle. |
| **microState** | Private state of an instance. Source of truth for that instance's template and handlers. Not directly readable by other instances. |
| **MacroState** | Page-wide coordination bus. Push-only. Flat namespace. NOT a general data store. |
| **Baker** | Server-side function colocated with a part. It may fetch data and returns page renderer metadata plus the object that becomes the instance's microState. It is never imported by the browser part module or the client engine. See `docs/server-bakers.md`. |
| **Template** | Pure function `(state, part) => string`. Returns HTML string. Used for initial mount render and for explicit re-renders of regions. |
| **Handlers** | Reactions to DOM events, microState changes, and lifecycle. Single export of `handlers.js`. |
| **Mount script** | A `<script type="module">` block in the page HTML that imports a part module and calls `mount(...)`. One per instance. |
| **Baked JSON** | The combined initial state assembled by page renderers and server-side bakers, embedded in the page as `<script type="application/json" id="__BAKED__">`. |
| **Mirror field** | A field of `state` whose value is fed by a MacroState path declared in the instance's `subscribe` parameter. |
| **Owner** | The instance that exposes a path in MacroState via `expose`. The only writer of that path. |

---

## 3. Part Layout (Filesystem Contract)

A part lives in its own directory under `src/parts/` (served publicly as `/parts/` for browser files):

```
src/parts/<name>/
  index.js       # browser façade: imports template.js and handlers.js only
  template.js    # default export: (state, part) => string
                 # optional named exports: item, row, ... — sub-templates
  handlers.js    # default export: { events, state, onMount, onDestroy }
  baker.ts       # optional server-only module; never imported by index.js
```

`index.js` MUST follow this shape:

```js
import * as templates from './template.js';
import handlers from './handlers.js';

export default {
  template: templates.default,
  templates,                                // includes default + sub-templates
  handlers,
};
```

The browser engine consumes this default export as the **part module**. Exact field names are part of the client contract:
- `template` — function (the primary template)
- `templates` — namespace object containing all template exports
- `handlers` — object

`index.js` MUST NOT export or import `baker`. A baker is server-side code and may import DB/API/server modules that cannot run in the browser. The baker belongs next to the part because it produces that part's state contract, but it is used by `src/pages/*`, not by `/engine/core.js`.

---

## 4. Instance Parameters

The object passed to `mount(partModule, params)` for a specific instance:

```js
{
  id: 'product-card-42',         // REQUIRED; unique within the page
  microState: { /* ... */ },      // optional fallback initial state if no baked slice exists
  expose: ['inStock', 'price'],   // optional; field names visible in MacroState
  subscribe: {                    // optional; map: state field name -> MacroState path
    globalDiscount: 'cart.discountPercent',
  }
}
```

### 4.1 `microState` field — interpretation

The client engine never calls a baker. Initial state is resolved as:

1. Read baked JSON from `<script type="application/json" id="__BAKED__">`.
2. If `baked[params.id]` exists, use that object as the instance microState.
3. Otherwise use `params.microState`.
4. If neither exists, use an empty object.

For page roots, server-side bakers normally provide a baked slice keyed by the stable instance id. `microState` remains useful for tiny client-only parts or safe fallbacks, but it is not baker input.

### 4.2 Path construction in MacroState

Exposed paths are built automatically as `{id}.{field}`. Examples:

- Instance `id: 'cart'` exposing `count` → MacroState path `cart.count`.
- Instance `id: 'product-card-42'` exposing `inStock` → `product-card-42.inStock`.

The engine MUST construct these paths and MUST NOT permit alternative naming. Authors achieve readable shared paths by choosing meaningful instance ids (`cart`, `auth`, `header-search`) rather than by overriding path generation.

### 4.3 `subscribe` field — local-name to remote-path binding

`subscribe` is a map: **local state field name → MacroState path**. The local name MUST match a key in `handlers.state` of this part. The remote path is provided by the composing parent at instance creation time.

This separation is crucial: the part's code references only local names. Concrete remote paths are decided at the moment of instance creation by the parent. The same part can be instantiated against different remote paths in different contexts.

When a page renderer wires instances with `expose` or `subscribe`, keep a short `MacroState contract` JSDoc comment near that page composition code. It MUST stay current when paths are added, renamed, removed, or moved to another module. Use the compact shape:

```ts
/**
 * MacroState contract:
 * - owns: product-card-42.inStock
 * - mirrors: globalDiscount <- cart.discountPercent
 */
```

Add this comment to other composing modules when they introduce page-level MacroState ownership or mirrors. Do not list ordinary microState fields there.

### 4.4 Serializability

Instance parameters MUST contain only serializable values (primitives, plain objects, arrays). Functions, class instances, DOM nodes, etc. are FORBIDDEN. The page renderer on the server serializes parameters into the literal source code of the mount script.

---

## 5. The `part` Object (Instance Handle)

The first argument passed to every handler. Fields:

| Field | Type | Description |
|---|---|---|
| `part.id` | string | Instance id, immutable after mount. |
| `part.state` | object | The microState. Reads are direct. Writes via `part.set` (recommended). |
| `part.refs` | object | Map of `data-ref` name → DOM node. Populated during mount. Empty before mount step 6. |
| `part.root` | Element | The root DOM node of the instance. Populated during mount. |
| `part.private` | object | Author-controlled scratch area (timer ids, abort controllers, child instance references). Not part of state, not exposed to MacroState, not subject to set semantics. |
| `part.templates` | object | The part's exported templates. `part.templates.default`, `part.templates.item`, etc. |
| `part.set` | function | The only side-effect-bearing way to mutate state. See §6. |

The engine MUST NOT add fields to `part` beyond those listed without specification update. Authors MUST NOT depend on engine-internal fields (e.g., implementation-detail flags); only the documented surface is stable.

---

## 6. `set` — Mutating microState

```js
part.set('quantity', 5);

part.set({
  quantity: 5,
  total: 500,
});
```

### 6.1 Behavior of `set`

For each `(key, newValue)` pair:

1. Compare `newValue` to current `part.state[key]` using `===`.
2. If equal → no-op for this key.
3. If different → write `newValue` into `part.state[key]`.
4. If `key` is in `expose` → notify MacroState (which propagates to subscribers in other parts).
5. If `handlers.state[key]` exists → call it with `(part, newValue, oldValue)`.

### 6.2 Batched form

`part.set({ ... })` processes all keys atomically:

- Phase 1: write all changed values into `part.state`.
- Phase 2: invoke MacroState notifications for all changed exposed keys.
- Phase 3: invoke `handlers.state[key]` for all changed keys.

Each handler/subscriber sees `part.state` in its **fully updated form** — never half-updated.

### 6.3 Equality semantics

Reference equality (`===`) for objects, arrays, functions. To trigger handlers/notifications when modifying a collection, replace the reference:

```js
// Correct:
part.set('items', [...part.state.items, newItem]);

// Wrong (no notification):
part.state.items.push(newItem);
part.set('items', part.state.items);
```

This is intentional. It pushes authors toward immutable update patterns and avoids deep-equality cost in the engine.

### 6.4 Forbidden writes

- Writing to a **mirror field** (a field listed in this instance's `subscribe`) via `part.set` — **error**. Mirror fields are owned elsewhere; only MacroState updates them on this instance.

### 6.5 Silent writes

Direct assignment `part.state.x = ...` is **permitted by design**. It writes to state but triggers no notification and no state-handler. Use cases:

- Temporary scratch values between several `set` calls.
- Caches inside handlers.
- Fields the author deliberately keeps "non-reactive".

This MUST NOT be enforced against by the engine. Authors using direct assignment have made a deliberate choice. Documentation should recommend `set` as the default.

---

## 7. Handlers

```js
export default {
  events: {
    'click [data-action="add"]': (part, event) => {
      part.set('quantity', part.state.quantity + 1);
    },
    'input [data-action="set-note"]': (part, event) => {
      part.set('note', event.target.value);
    },
  },

  state: {
    quantity: (part, newValue, oldValue) => {
      part.refs.counter.textContent = newValue;
    },
    items: (part, newValue) => {
      part.refs.list.innerHTML = newValue
        .map(item => part.templates.item(item, part))
        .join('');
    },
    globalDiscount: (part, newValue) => {
      // mirror field — driven by MacroState via `subscribe`
      part.set('finalPrice', part.state.basePrice * (1 - newValue / 100));
    },
  },

  onMount: (part) => {
    part.private.timerId = setInterval(() => {
      part.set('seconds', part.state.seconds + 1);
    }, 1000);
  },

  onDestroy: (part) => {
    clearInterval(part.private.timerId);
    for (const child of Object.values(part.private.children || {})) {
      destroy(child);
    }
  },
};
```

### 7.1 Two-stage processing model (CRITICAL RULE)

**DOM events and MacroState changes only mutate microState. DOM updates live only in state-handlers.**

Flow is strictly directed:

```
DOM event ─┐
MacroState ─┼─► microState ─► DOM
onMount ───┘
async ─────┘
```

**MUST NOT** update the DOM directly from an event handler or from anywhere except `handlers.state[*]`. The single source of truth is `state`; the single point of DOM synchronization is the state handler. Implementations MUST document this rule prominently and example code MUST consistently follow it.

### 7.2 Handler categories

#### `events`

DOM events. Keys are strings of the form `'<event-type> <selector>'`, e.g. `'click [data-action="add"]'`.

Implementation: the engine attaches **one delegated listener per event type** to `part.root`. Inside, `event.target.closest(selector)` routes the event to the correct handler.

Signature: `(part, event) => void`.

#### `state`

Reactions to changes in this instance's microState. Triggered by `part.set` (own writes) and by MacroState updates flowing into mirror fields (cross-part propagation).

Keys are state field names. Signature: `(part, newValue, oldValue) => void`.

There is **no separate `handlers.macro` category**. MacroState subscriptions surface as mirror fields and are handled in `state`.

#### `onMount`

Called after mount completes (state populated, DOM in tree, handlers attached). Use for: timers, imperative `window`/`document` listeners, initial fetches.

Signature: `(part) => void`.

#### `onDestroy`

Called before instance teardown. Author MUST clean up:

- Timers (`clearTimeout`, `clearInterval`).
- Imperative listeners on `window`/`document` (set up in `onMount`).
- Pending `fetch` aborts.
- **Child instances** owned by this part (via `destroy()` calls).

Signature: `(part) => void`.

### 7.3 Global events (window/document)

Event delegation on `part.root` does NOT cover events on `window` or `document` (e.g. global `keydown` for Escape, `resize`, `scroll`). For the first version, handle these imperatively in `onMount`/`onDestroy`:

```js
onMount: (part) => {
  const onKey = (e) => { if (e.key === 'Escape') part.set('open', false); };
  window.addEventListener('keydown', onKey);
  part.private.cleanup = () => window.removeEventListener('keydown', onKey);
},

onDestroy: (part) => {
  part.private.cleanup?.();
}
```

A future declarative form (e.g., `'keydown @window'` keys in `events`) is **deferred**. Implementations MUST NOT add it without specification update.

### 7.4 Cycles via `set` inside state-handlers

A state-handler MAY call `part.set` for other fields. This may chain into another state-handler. Cycles are the author's responsibility; the engine MUST NOT detect or prevent them. Infinite recursion will throw a stack overflow, which is treated as an author error (the resulting trace makes the cycle visible).

---

## 8. Templates

Templates are **JavaScript functions returning HTML strings**. No DSL, no parsing of custom syntax, no runtime template compiler.

```js
import { escape } from '/engine/core.js';

export default (state, part) => `
  <article data-part-id="${part.id}">
    <h3 data-ref="title">${escape(state.name)}</h3>
    <p data-ref="price">${escape(state.price)} ₽</p>
    <button data-action="add">Add to cart</button>
  </article>
`;
```

Sub-templates as named exports:

```js
export const item = (item, part) => `
  <li data-id="${item.id}">${escape(item.name)}</li>
`;
```

### 8.1 Template rules

- Template MUST return a string.
- Parsed string MUST contain **exactly one root element**. Otherwise the engine throws an error with description.
- Engine parses the string via a `<template>` element: `tpl.innerHTML = str; tpl.content` yields a `DocumentFragment`. `fragment.children.length === 1` is the validation.
- Escaping of inserted user data is the **author's responsibility**. The engine provides `escape()` as a utility.
- Inline event handlers (`onclick="..."`) are FORBIDDEN. Use `data-action` attributes routed through `events`.

### 8.2 DOM markup conventions

- `data-action="<name>"` — receives delegated events. Match selector: `[data-action="<name>"]`.
- `data-ref="<name>"` — populates `part.refs.<name>` with the DOM node.
- Duplicate `data-ref="X"` within one part — **error**.

### 8.3 DOM update strategies (author's choice)

In state-handlers, the author chooses between:

- **Targeted DOM mutations** via `part.refs.X.textContent`, `classList.toggle`, etc. Best for single-value updates.
- **Region re-render** via `part.refs.container.innerHTML = part.templates.item(...).map(...).join('')` etc. Best for lists and substantial structural changes.

Region re-render destroys all DOM state inside the region (focused inputs, open dropdowns, scroll position). Author MUST move anything that should survive into `state` so re-render reconstructs it correctly.

### 8.4 Patch-trigger state fields

For collection updates, authors MAY split "replace the whole collection" from "patch a small part of the collection":

```js
state: {
  items: rerenderWholeList,
  patchItemStatusUpdates: applyPatchItemStatusUpdates,
}
```

In this pattern:

- `items` means "replace the collection" and usually performs a region re-render.
- `patchItemStatusUpdates` is a patch state field carrying serializable state changes for known items.
- The `patchItemStatusUpdates` state-handler MUST apply the patch to `part.state.items` and update only the affected DOM nodes.

Example:

```js
events: {
  'click [data-action="download"]': (part, event) => {
    part.set({
      patchItemStatusUpdates: [{ id: event.target.dataset.id, status: 'queued' }],
    });
  },
},

state: {
  items: rerenderItems,
  patchItemStatusUpdates: (part, updates) => {
    part.state.items = part.state.items.map((item) => {
      const update = updates.find((entry) => entry.id === item.id);
      return update ? { ...item, status: update.status } : item;
    });
    for (const update of updates) rerenderOneItem(part, update.id);
  },
}
```

This is allowed because DOM writes still live in `handlers.state[*]`, and event handlers still only call `part.set`. The direct assignment to `part.state.items` is a required controlled silent write inside the state synchronization step: the backing collection must stay current before targeted DOM updates are applied. It MUST NOT be used from DOM event handlers as a shortcut.

Patch-trigger fields MUST NOT turn microState or MacroState into an event bus. A patch field is valid only when it represents a real state delta that can be folded into the backing state. Prefix patch fields with `patch`, for example `patchItemStatusUpdates`. Do not introduce command-shaped patch fields such as `patchItemMove`, `channelOrderMove`, or `doRefresh` just to trigger behavior. If the durable state is a reordered collection, update the collection state; if targeted DOM movement is needed, the `items` state-handler may compare `newValue` and `oldValue` and move only affected nodes.

One-shot event trigger fields, when unavoidable, MUST use the `event` prefix, for example `eventScrollTop` or `eventReload`. Do not use a `Requested` suffix.

### 8.5 Security

- `escape()` handles `<`, `>`, `&`, `"`, `'`. Use it for all user-derived insertions.
- `escape()` does NOT validate URL schemes. `href`/`src` with user-controlled URLs need separate validation against `javascript:` URIs.
- The page never embeds inline `onclick`, `onload`, etc. All event handling goes through `data-action` delegation.
- Baked JSON sits in `<script type="application/json">` — browser does not execute it. Parse via `JSON.parse(textContent)`.

---

## 9. Lifecycle

### 9.1 `mount(partModule, params)` — exact sequence

The engine MUST execute these steps in this exact order:

**Step 1 — Data preparation**
- Read baked JSON from `<script id="__BAKED__">`.
- Look up the slice for `params.id`.
- If a baked slice exists, use it as the instance's initial state.
- Otherwise use `params.microState` if provided.
- Otherwise use an empty object.

The client engine MUST NOT inspect or call any baker. Baker execution is complete before the HTML response is sent.

**Step 2 — Instance object creation**
- Create `part` with: `id`, `state` (from step 1), `private` (empty object), `templates` (from module), `set`. `root` and `refs` are not yet populated.

**Step 3 — Owner registration in MacroState**
- For each name in `params.expose`, claim the path `{params.id}.{name}` as owned by this instance.
- If any claimed path is already owned (duplicate id) → **error**.
- At this step, no values are published yet.

**Step 4 — Subscription registration**
- For each `(localFieldName, remotePath)` in `params.subscribe`:
  - Validate: `localFieldName` MUST be a key of `handlers.state`. If not → **warn**, skip this subscription.
  - Validate: `remotePath` MUST refer to an already-registered owner path. If not → **warn**, skip this subscription.
  - Validate: `remotePath` MUST NOT be a path this instance is itself the owner of. If it is → **error**.
  - Register the subscription with MacroState.
  - **Read the path's current value from MacroState and write it directly into `part.state[localFieldName]`.** This write is **silent**: no state-handler call, no MacroState notification.

**This is the critical resolution of the mount-time ordering question:** mirror fields are populated silently during step 4, before the template renders. The corresponding state-handlers will fire only on **subsequent** changes, never on initial population.

**Step 5 — Owner value publication**
- For each name in `params.expose`, MacroState publishes the current value of `part.state[name]` to subscribers in other instances.
- Other instances' state-handlers (for their mirror fields bound to this path) fire as normal cross-part propagation.

**Step 6 — Template render**
- Call `partModule.template(part.state, part)`.
- Validate result: must be a string with exactly one root element after parsing through `<template>`.
- Parse, capture the root element as `part.root`.
- Walk the subtree, populate `part.refs` from `[data-ref]` attributes. Duplicate refs → **error**.

**Step 7 — Event delegation setup**
- Group keys of `handlers.events` by event type.
- For each event type, attach one listener to `part.root`.
- The listener routes to the correct handler via `event.target.closest(selector)`.

**Step 8 — DOM insertion**
- Replace the originating `<script>` element with `part.root`, OR insert `part.root` adjacent to the script and remove the script. Implementations MAY use either approach.

**Step 9 — `onMount` invocation**
- Call `partModule.handlers.onMount?.(part)`.

`mount` returns the `part` object. The caller is responsible for retaining the reference if it needs to call `destroy(part)` later.

### 9.2 `destroy(instance)` — exact sequence

**Step 1 — Idempotency guard**
- If `instance` is already destroyed → no-op (optional: warn in development mode).
- Mark as destroyed before proceeding.

**Step 2 — `onDestroy` invocation**
- Call `partModule.handlers.onDestroy?.(part)` inside a try/catch.
- Errors thrown by `onDestroy` MUST be logged but MUST NOT abort the destroy sequence.

**Step 3 — Detach event listeners**
- Remove all delegated listeners installed in mount step 7.

**Step 4 — Detach subscriptions**
- For each subscription registered in mount step 4, remove from MacroState.

**Step 5 — Release owner paths**
- For each path in `expose`, remove ownership from MacroState.
- Notify subscribers of removal: write `undefined` (or an explicit "removed" marker) into their mirror fields and call their state-handlers as in step 5 of normal propagation.

**Step 6 — Release id**
- The `id` becomes available for re-registration.

**Step 7 — Remove from DOM**
- Remove `part.root` from its parent.

### 9.3 Cascade-destroy is the author's responsibility

The engine MUST NOT track parent-child relationships between instances. There is no `parent` parameter in `mount`. There is no automatic cascade.

Authors implement cascade in `onDestroy`:

```js
// at child creation:
part.private.modal = mount(modalPart, params);

// at individual removal:
destroy(part.private.modal);
part.private.modal = null;

// at parent destroy:
onDestroy: (part) => {
  if (part.private.modal) destroy(part.private.modal);
  for (const child of Object.values(part.private.children || {})) {
    destroy(child);
  }
}
```

This is in line with principle 5 (developer responsibility): tracking parent-child links would be either pervasive (every `mount` needs the link) or fragile (heuristics on DOM containment). Authors already hold child references in `private` for their own logic; `destroy` reuses those references.

### 9.4 When `destroy` is required

Required when an instance genuinely goes away — its DOM is removed, its state no longer relevant, its subscriptions and ownership must disappear:

- Removing one item from a list.
- Closing a modal/dropdown that was implemented as its own instance.
- Replacing one part with another in the same slot.
- Re-rendering a list with element replacement (destroy old → re-render → mount new).
- Leaving the page in SPA-style navigation.

NOT required when:

- The part is hidden via CSS (`display: none`) — it remains in the DOM, alive.
- Data updates via `set` and DOM updates in state-handlers — same instance.
- Tabs switch where inactive tabs are merely hidden.
- List re-renders where items remain the same instances.

**Author rule:** "If you remove an instance's DOM, call `destroy` first."

---

## 10. MacroState — Detailed Behavior

### 10.1 Properties

- One MacroState per page (lives on the client side, in the engine module).
- Flat namespace of paths. Each path = `{instanceId}.{fieldName}`.
- Internally, MacroState retains the **last value** of each registered path so it can synchronously deliver to new subscribers (see mount step 4).

### 10.2 No external `get`

There is **no** `MacroState.get(path)`. External read access is FORBIDDEN. Subscribers learn values exclusively through their mirror fields, populated by:

- Initial silent write during mount step 4 (current value at subscription time).
- Subsequent changes published by the owner via `set`.
- The "removed" notification when the owner is destroyed.

This is intentional. It keeps MacroState a **push-only coordination bus**, not a general data store. Authors who think they need `get` are usually trying to use MacroState as shared data (anti-pattern); the right tool for that is parameters from a parent.

### 10.3 Owner registration

At mount step 3:

- Claim path `{id}.{field}` for each `field` in `expose`.
- Duplicate id → **error**.

### 10.4 Subscription validation matrix

At mount step 4, for each `(localName, remotePath)`:

| Condition | Reaction |
|---|---|
| `localName` is not a key of `handlers.state` | **warn**, skip subscription |
| `remotePath` has no owner registered | **warn**, skip subscription |
| `remotePath` is owned by **this** instance | **error** |
| Otherwise | Register subscription, silently write current value to `part.state[localName]` |

### 10.5 Publishing changes

When an owner instance calls `part.set(field, value)` and `field` is in its `expose`:

- After the local write, MacroState propagates to all subscribers of that path.
- Each subscriber's mirror field is updated.
- Each subscriber's `handlers.state[localName]` fires with `(part, newValue, oldValue)`.

This propagation is synchronous within the calling context, in subscription registration order. Reentrancy is permitted (see §7.4).

### 10.6 Path removal

When an owner is destroyed (mount step 5 of destroy):

- Path is removed from MacroState's registry.
- All subscribers receive a removal notification: their mirror field is set to `undefined`, their state-handler fires.
- Subscriptions on the removed path are dropped (no future events possible).
- The path becomes available for a new owner.

### 10.7 What never happens to MacroState

- `set` from outside the owner — not possible (no API exists).
- Cross-instance writes — not possible. Only the owner of a path can change its value, and only via its own `set`.
- Deep paths — paths are exactly two segments: `id` and `field`. No `cart.items.0.name`. Authors who need nested coordination structure expose a top-level field whose value is an object/array.
- Event dispatch through MacroState — forbidden. MacroState paths hold current state values, not one-shot commands. Do not expose fields whose only purpose is to make subscribers "do something".

---

## 11. Server-Side State Production

Server-side bakers and page renderers produce the baked JSON consumed by the client engine. The client engine never imports or calls bakers; it only reads `baked[params.id] ?? params.microState ?? {}`.

Detailed rules for handlers, page renderers, DB/API loading, baked JSON assembly, query batching, and baker errors live in `docs/server-bakers.md`. nginx/Node deployment and request routing live in `docs/server-runtime.md`.

---

## 12. Client Bootstrap

### 12.1 Engine delivery

The engine lives at `/engine/core.js` and exports:

- `mount(partModule, params) → instance`
- `destroy(instance) → void`
- Utilities: `escape(str)`, possibly others (specified as added).

The page renderer links the engine in `<head>`:

```html
<script type="module" src="/engine/core.js"></script>
```

`type="module"` defers execution by default. The engine MUST initialize MacroState as a singleton on module load.

### 12.2 Mount script structure

For each instance, the page renderer embeds:

```html
<script mount-dot="mount-dot-product-card-42" type="module">
  import partModule from '/parts/product-card/index.js';
  import { mount } from '/engine/core.js';
  mount(partModule, {
    id: 'product-card-42',
    microState: {},
    expose: ['inStock'],
    subscribe: { globalDiscount: 'cart.discountPercent' }
  });
</script>
```

The script is the mount anchor. Implementations MAY locate it by `document.currentScript`, by a stable generated marker such as `mount-dot="mount-dot-${id}"`, or both. The rendered DOM is inserted at that position by replacing the anchor with `part.root`.

### 12.3 Initialization order

The order of mount scripts in HTML defines the order of instance initialization. This is also the order of owner registration in MacroState.

**Author rule:** an instance whose paths other instances subscribe to MUST appear earlier in the HTML than its subscribers.

If order is violated:
- Subscriber's `subscribe` step warns "owner not registered" and skips that binding.
- The mirror field stays at its initial value (or `undefined`).
- When the owner registers later, it publishes its initial value, and the subscriber receives it as a normal change event (state-handler fires).

The author MAY rely on this fallback (it's the same code path as later runtime updates), but the warning indicates an avoidable issue.

### 12.4 First paint considerations

`type="module"` is deferred. Total time-to-content is approximately:

```
HTML parse + module graph fetch + execution of all mount scripts
```

For pages where time-to-first-paint matters more than time-to-content, the author MAY use synchronous inline scripts before `<body>`. This is a page-level tradeoff, NOT a concept-level concern. The engine works in either mode.

The target use case (tens of entities) makes both modes acceptable in practice.

---

## 13. Errors and Warnings — Exhaustive Table

Implementations MUST emit these exact reactions. The principle: **error** when continuing would hide a bug; **warn** when continuing is correct but might be unintended.

| Situation | Reaction |
|---|---|
| Duplicate `id` at owner registration | Error |
| Subscription to a path with no registered owner | Warn, skip subscription |
| Instance subscribing to a path it itself owns | Error |
| `subscribe` map contains a name not present in `handlers.state` | Warn, skip subscription |
| `handlers.state` contains a name with no own state field and no `subscribe` entry | Not an error: handler simply fires only when that field is set |
| Mount params have no baked slice and no `microState` | Not an error: state defaults to `{}` |
| Template returns a string with multiple root elements (or zero) | Error with description |
| Duplicate `data-ref` value within one template | Error with description |
| `set` called on a mirror field | Error |
| `set` called after the instance was destroyed | Warn, no-op |
| `destroy` called twice on the same instance | Warn (in dev), no-op |
| Exception thrown inside `onDestroy` | Log, continue teardown |
| Baker throws during bake phase | Bubble to server-side page renderer/handler code; application decides |
| Inline event handler attribute (`onclick="..."`) in a template | Not detected by engine; author convention violation |

Implementations MAY add additional warnings in development mode (e.g., detection of detached instances via WeakRef in dev tools), but MUST NOT add behavior that affects production correctness beyond this table.

---

## 14. Security

- Author is responsible for escaping user-derived data in templates. The engine provides `escape()`.
- `escape()` is sufficient for text content and quoted attribute values. It does NOT validate URL schemes; `href`/`src` with user-controlled URLs need separate validation.
- Inline event handlers (`onclick="..."`) MUST NOT appear in templates. All event handling goes through `data-action` delegation.
- Baked JSON is embedded as `<script type="application/json">`. The browser does not execute it. Authors parse it as text and `JSON.parse`.
- Mount script source code is generated by the page renderer on the server. Parameters are serialized as JS literals. The page renderer MUST ensure no user-controlled value leaks into mount script source unescaped.

---

## 15. What the Tool Deliberately Omits

These are not missing features — they are deliberate non-features. Implementations MUST NOT add them without specification update.

| Feature | Status |
|---|---|
| Server-rendered page bodies | Deliberately absent; the server emits shell, baked JSON, and mount scripts |
| Reactive system / dependency tracking | Deliberately absent |
| Virtual DOM, diffing | Deliberately absent |
| List virtualization | Deliberately absent (target scope doesn't require it) |
| Infinite scroll, viewport-based lazy mounting | Deliberately absent |
| Computed/derived state in core | Deliberately absent — compute manually in state-handlers |
| Two-way form binding in core | Deliberately absent — implement as a helper layer if needed |
| Dynamic subscriptions (runtime rebind) in v1 | Deferred — all subscriptions declared at mount via params |
| Automatic cascade `destroy` in engine | Deliberately absent — author handles in `onDestroy` |
| `MacroState.get(path)` / external read | Deliberately absent — push-only |
| Engine-tracked parent-child instance graph | Deliberately absent — author tracks via `private` |
| Deep paths in MacroState (`a.b.c.d`) | Deliberately absent — paths are exactly `{id}.{field}` |
| Auto-cleanup via WeakRef/WeakMap | Deliberately absent — explicit destroy required |
| Declarative `'keydown @window'` events | Deferred — use imperative `onMount`/`onDestroy` |

---

## 16. Author Heuristics (How to Think When Writing Parts)

These are the rules-of-thumb authors should internalize. Implementations of documentation, examples, and tutorials MUST consistently reflect them.

### 16.1 microState is the norm; MacroState is the exception

Default to keeping a field in microState. Move it to `expose` only when there's a concrete reason: the value will be read or written by **at least two independent parts** on the page.

Test before exposing: "Will this value be observed or changed by parts that don't otherwise know about each other?" If yes, expose. If no, keep private.

### 16.2 MacroState is for coordination, not for data

What belongs in MacroState:
- Pending flags (`upload.pending`, `auth.refreshing`).
- Status enums (`auth.status`, `connection.state`).
- Modes (`view.mode = 'edit'|'read'`).
- Coordination signals between unrelated parts.

What does NOT belong:
- Bulk data (product lists, article bodies) — that's microState of the owning part.
- Static page context (current user id, locale) — pass via parameters.
- Caches of computed values — recompute in state-handlers.

### 16.3 DOM mutations live only in state-handlers

This is the load-bearing rule of the architecture. It guarantees:
- One source of truth (`state`).
- One synchronization point (`handlers.state`).
- Testability (event handlers are pure state mutations, decoupled from DOM).

Event handlers and `onMount`/`onDestroy` MUST NOT touch the DOM directly. They write to state; state-handlers read state and update DOM.

### 16.4 Stable instance ids

When parts repeat (lists), derive ids from domain identity, not from DOM position:

- Good: `id: 'comment-' + comment.id`.
- Bad: `id: 'comment-' + index`.

Domain-stable ids let subscriptions survive list re-orderings and edits.

### 16.5 Use immutable updates for collections

`set` triggers handlers only when the new value differs by `===`. For collections:

```js
// Good:
part.set('items', [...state.items, newItem]);
part.set('user', { ...state.user, name: 'X' });

// Bad (no notification):
state.items.push(newItem);
state.user.name = 'X';
part.set(...) // already mutated, === holds
```

### 16.6 `escape` everything that could come from outside

In templates: any value from `state` that originated from user input or external data must pass through `escape()`. Numbers, booleans, and your own constants are safe.

For URLs, additionally validate the scheme.

### 16.7 Lifecycle responsibilities

- `onMount`: timers, `window`/`document` listeners, initial `fetch`, third-party library bindings.
- `onDestroy`: clear those timers, remove those listeners, abort those fetches, `destroy` child instances.

If you `mount` a child, you own its lifetime. Store the reference in `private`. Destroy it explicitly when it should go away.

### 16.8 Re-render vs targeted DOM update

- Targeted DOM update (`refs.X.textContent = ...`): cheap, preserves DOM state inside the region. Good for individual values.
- Region re-render (`refs.container.innerHTML = templates.item(...).map(...).join('')`): destroys DOM state inside, simpler code. Good for lists and complex restructuring.

State that must survive re-render lives in microState. Anything that lives only in DOM (focused element, scroll position, animation progress) is at risk during re-render.

---

## 17. Implementation Notes for the Engine

### 17.1 Engine module surface

```js
// /engine/core.js

export function mount(partModule, params) { ... }
export function destroy(instance) { ... }
export function escape(value) { ... }

// Internally:
// - MacroState singleton
// - registry of owned paths
// - registry of subscriptions per path
// - per-instance bookkeeping (listeners, subscriptions, destroy flag)
```

### 17.2 MacroState internal shape

A reasonable internal representation:

```js
// path -> { value, ownerInstance, subscribers: [{ instance, localName }] }
const paths = new Map();
```

Owner registration claims a path; `value` starts as the owner instance's current state field.
Subscription pushes a `{ instance, localName }` entry.
Publishing iterates subscribers, writes to each `instance.state[localName]`, calls each `instance.handlers.state[localName]`.

### 17.3 Template parsing

Use a `<template>` element for safe HTML fragment parsing:

```js
function parseTemplate(htmlString) {
  const tpl = document.createElement('template');
  tpl.innerHTML = htmlString;
  if (tpl.content.children.length !== 1) {
    throw new Error(
      `Template must return exactly one root element, got ${tpl.content.children.length}`
    );
  }
  return tpl.content.firstElementChild;
}
```

### 17.4 Event delegation

For each event type that appears in `handlers.events` keys:

```js
const listenersByType = groupBy(handlers.events, key => key.split(' ')[0]);

for (const [type, entries] of listenersByType) {
  part.root.addEventListener(type, (event) => {
    for (const [key, handler] of entries) {
      const selector = key.slice(type.length + 1);
      const match = event.target.closest(selector);
      if (match && part.root.contains(match)) {
        handler(part, event);
        break; // first match wins
      }
    }
  });
}
```

Event delegation uses **first match wins**. When multiple handlers for the same event type could match, the engine MUST invoke the first matching handler in declaration order and then stop. Authors using two handlers for the same event need distinct selectors.

### 17.5 `refs` collection

After parsing the template:

```js
const refs = {};
for (const node of part.root.querySelectorAll('[data-ref]')) {
  const name = node.getAttribute('data-ref');
  if (name in refs) {
    throw new Error(`Duplicate data-ref="${name}" in part ${part.id}`);
  }
  refs[name] = node;
}
// Also check the root itself
if (part.root.hasAttribute('data-ref')) {
  // same logic
}
```

### 17.6 Destroy flag

Each instance carries a `_destroyed` flag (engine-internal, not part of the public `part` object). All public methods check this flag and warn-no-op if set:

- `part.set(...)` after destroy → warn, no-op.
- `destroy(instance)` again → warn, no-op.

### 17.7 No global instance registry in production

The engine MUST NOT keep a strong reference to every instance for diagnostic purposes in production. Doing so would prevent garbage collection of forgotten instances and mask leak bugs.

In **development mode** the engine MAY maintain a `WeakSet` of mounted instances and a periodic check that their `root` is still in `document`, warning when an instance's DOM is detached but `destroy` was not called. This is a dev-only diagnostic, never a production behavior.

---

## 18. Open Items

These are NOT decided yet. Implementations encountering them MUST raise the issue rather than choosing silently.

- Working name of the tool/project.
- Dynamic subscription / rebind API — deferred until concrete need surfaces.
- Declarative global event keys (`'keydown @window'`) — deferred; imperative pattern in `onMount`/`onDestroy` is the v1 approach.
- Helper layer above the core: instance-collection helpers, two-way form-binding helpers, etc. — out of core scope; specified per-helper when needed.

---

## 19. Quick Reference for Agents

### A browser part module looks like:

```js
// parts/foo/index.js
import * as templates from './template.js';
import handlers from './handlers.js';

export default {
  template: templates.default,
  templates: { default, item?, ... },
  handlers: {
    events: { 'click [data-action="x"]': (part, event) => { ... } },
    state: { fieldName: (part, newValue, oldValue) => { ... } },
    onMount?: (part) => { ... },
    onDestroy?: (part) => { ... },
  },
};
```

### Server-side baker colocated with the part:

See `docs/server-bakers.md`.

### Mount parameters:

```js
{
  id: string,                  // required, unique on page
  microState?: object,          // optional fallback when no baked slice exists
  expose?: string[],           // field names → MacroState owner paths
  subscribe?: { [localFieldName]: macroPath },
}
```

### `part` object:

```
part.id, part.state, part.refs, part.root, part.private, part.templates, part.set
```

### `set` signature:

```js
part.set(key, value)
part.set({ key1: value1, key2: value2 })
```

### Engine API:

```js
import { mount, destroy, escape } from '/engine/core.js';

const instance = mount(partModule, params);
destroy(instance);
const safeText = escape(userValue);
```

### Critical rules to enforce in code review:

1. DOM mutations only in `handlers.state[*]`.
2. `set` is the way to mutate state with effects; direct assignment is silent by design.
3. Mirror fields are read-only via `set`.
4. Instance ids are stable relative to domain identity, not DOM position.
5. `escape` user data in templates.
6. Owners come before subscribers in HTML.
7. `destroy` is called by whoever called `mount`, before the DOM is removed.
8. Children are tracked in `private`, destroyed in parent's `onDestroy`.
