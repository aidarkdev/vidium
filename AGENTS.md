# Agent Instructions

Do not invent architecture or add code before inspecting the current implementation. Less code is better: fewer moving parts means fewer bugs. If a requested change is ambiguous, inspect first and ask a concrete question before writing code.

Before changing frontend parts, read `docs/frontend-parts.md` and follow it. For server-side data loading and baked state, read `docs/server-bakers.md`. For nginx/Node runtime behavior, read `docs/server-runtime.md`.

Current frontend boundaries:

- `src/handlers/*` is the HTTP boundary: request/response, session, params, forms, redirects, status codes.
- `src/pages/*` assembles the HTML shell, baked JSON, and mount scripts.
- `src/parts/*/baker.ts` is server-only part code. It may load DB/API data and builds the state contract for that part.
- Browser part modules are `src/parts/*/index.js`, `template.js`, and `handlers.js`.
- Browser `index.js` MUST NOT import or export `baker`.
- `src/engine/core.js` MUST NOT know about client bakers or `useBaker`.
- Baked JSON is flat by stable instance id.
- DOM changes MUST live in `handlers.state[*]`.
- Event handlers should call `part.set(...)`; async work should end in `part.set(...)`.
- Direct DOM in `onMount`/`onDestroy` is only for imperative global listeners, timers, fetch abort cleanup, and similar lifecycle work.
- Inline event attributes such as `onclick` are forbidden.
- Prefer extending current parts/pages/bakers over adding new framework layers.

For collection UI updates:

- Use collection fields like `cards`/`items` for full collection replacement and region re-render.
- Use explicit patch-trigger fields like `cardStatusUpdates` for targeted DOM updates.
- Patch-trigger handlers may update the backing collection inside `handlers.state[*]`, then update only affected DOM nodes.
