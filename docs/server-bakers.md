# Server Bakers and Page Renderers

This document describes server-side data loading and baked-state assembly for frontend parts. Client part and engine contracts live in `docs/frontend-parts.md`. nginx/Node deployment details live in `docs/server-runtime.md`.

## Boundary

The application server has three separate layers:

1. **Handlers** — HTTP boundary. They read `req/res`, require sessions, parse params/forms, choose status codes, and call one page renderer.
2. **Page renderers** (`src/pages/*`) — assemble the HTML shell. They call server-side bakers, build flat baked JSON, and place mount scripts.
3. **Part bakers** (`src/parts/*/baker.ts`) — server-only data loaders/state builders colocated with the part whose state they produce.

Handlers should not manually load page data from the DB for HTML pages. DB/API access for page state belongs in server-side bakers.

## Handler Shape

A handler should call one page renderer:

```ts
export function handleFeed(req, res, params) {
  const session = requireSession(req, res);
  if (!session) return;

  html(res, renderFeedPage({
    lang: session.data.lang,
    params,
  }));
}
```

The handler MUST NOT manually perform `bake + render` as two separate calls. This keeps HTTP concerns in handlers and page composition inside `src/pages/*`.

## Baker Contract

A baker is a server-side function colocated with a part. It may access DB/API/server modules. It returns enough information for the page renderer to mount the client part:

```ts
export function bakeFeedPage(ctx) {
  const cards = getAllVideos();

  return {
    ok: true,
    id: 'feed-page',
    title: 'vidium',
    state: {
      cards,
      visibleCount: Math.min(21, cards.length),
      // fields expected by template.js and handlers.js
    },
  };
}
```

For not-found or other page-level absence, bakers MAY return a small result union:

```ts
{ ok: true, id, title, state }
{ ok: false, message }
```

The page renderer decides how to convert that result to HTML or `undefined`; the handler decides the HTTP response (`404`, redirect, etc.).

## Page Renderer Responsibilities

The page renderer:

1. Calls the relevant server-side baker(s).
2. Assembles baked JSON as a flat object keyed by stable instance id.
3. Generates the HTML string containing:
   - The engine module link (`<script type="module" src="/engine/core.js">` in head, or equivalent).
   - `<script type="application/json" id="__BAKED__">` with the baked JSON.
   - One mount-script per instance, placed at the desired DOM location.
4. Keeps any page-level `MacroState contract` JSDoc near the mount-script composition current when `expose` or `subscribe` paths change.
5. Returns the HTML string, or a typed absence result if the page cannot be rendered.

The page renderer MUST NOT emit server-rendered page bodies. It emits shell, baked JSON, and mount scripts. The client part template creates the DOM body.

## Baked JSON

Baked JSON is a flat object keyed by stable instance id:

```json
{
  "feed-page": { "cards": [], "visibleCount": 0 },
  "nav-controls": { "dropdownOpen": false },
  "back-top": { "visible": false }
}
```

The browser engine resolves initial state as:

```js
const state = baked[params.id] ?? params.microState ?? {};
```

The client engine never calls bakers and does not know about baker modules.

## Query Batching

If multiple instances need related data, batching is plain server JavaScript:

- A baker may issue a combined query and distribute data into one or more state objects.
- A page renderer may call several bakers and combine their results into one baked JSON object.
- The client engine MUST NOT introduce a "sheaf bakers" or "batched bakers" mechanism.

## Baker Errors

- Baker throws → server-side page renderer/handler receives the exception. The application decides: render an error page, return a 500, retry, etc. Server-level decision, not engine-level behavior.
- Baker returns `{ ok: false, message }` → page renderer may return `undefined` or another typed result; handler maps that to `404`, redirect, etc.
- Baked JSON missing a slice for an id → client falls back to `params.microState` or `{}`. For page roots, this is an author/server bug, but not a special engine baker error because the client has no baker concept.
