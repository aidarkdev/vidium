# Server Runtime

This document describes how vidium requests are served in production and how nginx and Node.js split responsibility. Frontend part contracts live in `docs/frontend-parts.md`.

## Runtime Boundaries

- nginx is the public HTTP entrypoint.
- Node.js runs `src/server.ts` and listens on `config.HOST:config.PORT`.
- nginx proxies application routes to Node.
- nginx serves public static/browser modules directly.
- Node authorizes protected media requests, then nginx serves media files via `X-Accel-Redirect`.

## Public URL Ownership

nginx owns these public URL prefixes:

```nginx
location /static/ { ... }
location /engine/ { ... }
location /parts/ { ... }
location /protected_media/ { internal; ... }
```

Node owns application routes and API routes that are not matched by nginx static aliases.

## nginx Locations

The active nginx site config must contain these locations inside the `server {}` block, before the generic `location /` proxy.

```nginx
location /static/ {
    alias /path/to/vidium/deploy/static/;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
}

location /engine/ {
    alias /path/to/vidium/deploy/engine/;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
}

location /parts/ {
    alias /path/to/vidium/deploy/parts/;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
}

location /protected_media/ {
    internal;
    alias /path/to/vidium/media/;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Replace `/path/to/vidium` with the deployed app directory. In `setup.sh`, shell escaping is required inside heredocs, so `try_files $uri =404;` appears as `try_files \$uri =404;` there.

## Static Frontend Assets

Production browser assets live under `<app>/deploy/`, prepared by `scripts/prepare-static.ts`. Each file gets a content hash in its filename (e.g. `core.e49da54c.js`). Node reads `deploy/asset-manifest.json` at startup and emits hashed URLs in HTML via `assetUrl()`.

- Logical path `/engine/core.js` → hashed file under `deploy/engine/`.
- `/parts/<name>/index.js`, `template.js`, `handlers.js` → hashed files under `deploy/parts/<name>/`.
- `/static/` CSS and icons → hashed files under `deploy/static/`.
- `/parts/<name>/baker.ts` stays in `src/parts/` — server-only, never deployed to `deploy/`.

nginx serves `deploy/` with `Cache-Control: public, max-age=31536000, immutable`. When content changes, the hash (and URL) changes, so browsers fetch fresh files.

**Local development:** without `deploy/asset-manifest.json`, the server falls back to unhashed logical paths (`/engine/core.js`, etc.). Point nginx at `src/` for local static serving, or use a one-off `prepare-static` + copy to `deploy/` to test production URLs.

If a hashed asset returns 404, restarting Node will not fix it — run `deploy-static.sh` or check nginx aliases point to `deploy/`.

Verify static module delivery after nginx changes:

```bash
curl -I https://example.com/engine/core.<hash>.js
curl -I https://example.com/parts/feed-page/index.<hash>.js
```

Expected result: HTTP 200, `cache-control: immutable`, not proxied Node 404. Use the current hash from `deploy/asset-manifest.json`.

## Node Router

`src/server.ts` declares routes in a `RouteConfig[]` and registers them with `Router`:

- Auth: `/login`, `/register`, `/logout`, `/lang/:code`
- Feed: `/`, `/feed`, `/feed/:tag`
- Channel/admin: `/channel/:id`, `/admin`
- Player pages: `/v/:id`, `/a/:id`
- Authorized media entrypoints: `/media/v/:id`, `/media/a/:id`, `/t/:id`
- API: `/api/download`, `/api/sidebar/mode`, `/api/channel`, `/api/video`, `/api/channel/display-name`, `/api/channel/tags`, `/api/channel/auto-download`, `/api/channel/guest-visible`, `/api/channel/reorder`, `/api/tag/reorder`, `/api/tag/delete`, `/api/admin/...`, `/api/status`, `/api/since`, `/api/feed/cards`

Handlers should remain the HTTP boundary: request/response, session, params/forms, redirects, status codes. Page HTML handlers should call one page renderer and should not manually load page data from the DB. Server-side part bakers handle page data loading and state building.

## Authorization

Authentication is session-based. Authorization is role-based with two roles:

- `user` — default for new registrations.
- `admin` — can use administrative UI and mutation endpoints.

Handlers own authorization decisions. Page renderers and bakers receive already-authorized context and must not decide whether the request is allowed.

Use the shared helpers by route type:

- HTML pages that require login: `requireSession(req, res)`.
- HTML pages that require admin: `requireAdmin(req, res)`.
- Public-capable HTML pages: use optional session lookup in the handler, then enforce guest channel/video access before rendering.
- JSON APIs that require login: `requireSessionApi(req, res)`.
- JSON APIs that require admin: `requireAdminApi(req, res)`.
- Public-capable JSON APIs: use optional session lookup in the handler, then filter unauthenticated responses to guest-visible channels.

Non-admin HTML admin routes respond with `403 Forbidden`. Non-admin admin API routes respond with JSON `403 { "error": "forbidden" }`.

Admin-only routes:

- `GET /admin`
- `POST /api/channel`
- `POST /api/video`
- `POST /api/channel/display-name`
- `POST /api/channel/tags`
- `POST /api/channel/auto-download`
- `POST /api/channel/guest-visible`
- `POST /api/channel/reorder`
- `POST /api/tag/reorder`
- `POST /api/tag/delete`
- `POST /api/admin/video/files/delete`
- `POST /api/admin/video/delete`
- `POST /api/admin/job/delete`
- `POST /api/admin/video/status/reset`
- `POST /api/admin/user/role`

Guest-visible routes:

- `GET /`, `/feed`, `/feed/:tag` render a public feed scoped to channels with `guest_visible = 1`.
- `GET /channel/:id` renders only when the channel has `guest_visible = 1`.
- `GET /v/:id`, `/a/:id`, `/media/v/:id`, `/media/a/:id` are public only for videos in guest-visible channels and only when the requested media kind is `ready`.
- `GET /t/:id`, `GET /api/status`, and `GET /api/feed/cards` are public only for guest-visible channel data.

Authenticated user routes:

- Full feed/channel/player pages, including private channels and non-public tags.
- Authorized media entrypoints for private or not-yet-public media: `/media/v/:id`, `/media/a/:id`, `/t/:id`.
- `POST /api/download`
- `POST /api/sidebar/mode`
- `GET /api/since`

The frontend may hide admin controls for non-admin users, but UI hiding is not authorization. Backend guards are authoritative so console/Postman calls cannot bypass role checks.

## HTML Page Request Flow

For a page request such as `/feed`:

```text
browser -> nginx location / -> Node src/server.ts -> route handler
handler -> require session / choose lang / pass params
page renderer in src/pages/* -> server-side baker in src/parts/*/baker.ts
baker -> DB/API data -> state
page renderer -> renderPartPage -> HTML shell + __BAKED__ + mount scripts
Node -> nginx -> browser
browser -> imports /engine/core.js and /parts/... modules through nginx aliases
engine -> mount(part, { id, microState }) -> part template creates DOM
```

## API Request Flow

API requests are proxied to Node. API handlers may read JSON bodies, perform CSRF/session checks, modify DB state, enqueue jobs, and return JSON.

Examples:

- `POST /api/download` sets video/audio status to `queued` and enqueues a download job.
- `POST /api/sidebar/mode` stores the feed sidebar mode in session data.
- `GET /api/status?ids=...` returns current DB media statuses for polling.
- `GET /api/since?...` returns new videos since a timestamp for feed updates.
- `GET /api/feed/cards?...` returns one paginated card collection page for feed controls.

## Protected Media Flow

Raw media files are not public through `/media/` paths. The flow is:

```text
browser -> /media/v/:id or /media/a/:id or /t/:id
nginx -> Node handler
Node -> require session
Node -> responds with X-Accel-Redirect: /protected_media/...
nginx -> internal /protected_media/ alias -> media file bytes
```

Relevant Node handlers are in `src/handlers/video.ts`:

```ts
X-Accel-Redirect: /protected_media/videos/:id.mp4
X-Accel-Redirect: /protected_media/audio/:id.m4a
X-Accel-Redirect: /protected_media/thumbs/:id.jpg
```

`/protected_media/` must be `internal` in nginx so clients cannot bypass Node authorization.

## Deployment Notes

Deployment commands and git/rsync workflows live in `docs/deploy.md`.

`setup.sh` creates or updates:

- runtime directories including `deploy/`
- permissions for nginx traversal
- nginx site config with `/static/`, `/engine/`, `/parts/` aliases to `deploy/`, plus `/protected_media/`
- systemd service for `vidium-server`

Do not rerun `setup.sh` just to fix a missing `/engine/` or `/parts/` alias on an existing server unless you intend to reapply all setup steps. For that case, edit the active nginx site config directly, then run:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Restart Node only for application code changes. Reload nginx for nginx config changes.
