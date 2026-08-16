# Server Runtime

This document describes how vidium requests are served in production and how nginx and Node.js split responsibility. Frontend part contracts live in `docs/frontend-parts.md`.

## Runtime Boundaries

- nginx is the public HTTP entrypoint.
- The pinned Node.js runtime under `<app>/runtime/node` runs `src/server.ts` and listens on `config.HOST:config.PORT`.
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

For application rate limits, Node trusts only `X-Real-IP`, and only when the socket peer is local nginx (`127.0.0.1`, `::1`, or `::ffff:127.0.0.1`). Direct requests to Node are keyed by the socket address and cannot spoof proxy headers. Do not fall back to the first `X-Forwarded-For` value: nginx may preserve a client-supplied value there.

## nginx Locations

The active nginx site config must declare the download rate-limit zone in the `http` context. A site file included from nginx's `http` context may place it immediately before the `server {}` block:

```nginx
limit_req_zone $binary_remote_addr zone=download_requests:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=play_requests:10m rate=10r/m;
```

The active site config must also contain these locations inside the `server {}` block. The exact download location applies the shared per-IP limit and takes precedence over the generic `location /` proxy.

```nginx
location = /api/download {
    limit_req zone=download_requests burst=4 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /api/play {
    limit_req zone=play_requests burst=9 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}

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
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Replace `/path/to/vidium` with the deployed app directory. In `scripts/setup/apply-host-config.sh`, shell escaping is required inside heredocs, so `try_files $uri =404;` appears as `try_files \$uri =404;` there.

The download limit accepts an initial burst of five requests per IP, then replenishes capacity at five requests per minute. nginx returns `429 Too Many Requests` before the request reaches Node when the limit is exceeded. The limit applies to authenticated and guest callers alike; do not key it from a guest-controlled cookie.

The play endpoint accepts a burst of ten requests per IP and then replenishes at ten per minute. Node additionally permits 30 play requests per actor per hour and records at most one play for the same user/IP, video, and media kind during that hour. Counts are stored as two bounded aggregate rows per video rather than an append-only event stream.

## Static Frontend Assets

Production browser assets live under `<app>/deploy/`, prepared by `scripts/prepare-static.ts`. Each file gets a content hash in its filename (e.g. `core.e49da54c.js`). Node reads `deploy/asset-manifest.json` at startup and emits hashed URLs in HTML via `assetUrl()`.

- Logical path `/engine/core.js` → hashed file under `deploy/engine/`.
- `/parts/<name>/index.js`, `template.js`, `handlers.js` → hashed files under `deploy/parts/<name>/`.
- `/static/` CSS and icons → hashed files under `deploy/static/`.
- `/parts/<name>/baker.ts` stays in `src/parts/` — server-only, never deployed to `deploy/`.

nginx serves `deploy/` with `Cache-Control: public, max-age=31536000, immutable`. When content changes, the hash (and URL) changes, so browsers fetch fresh files.

**Local development:** without `deploy/asset-manifest.json`, the server falls back to unhashed logical paths (`/engine/core.js`, etc.). Point nginx at `src/` for local static serving, or use a one-off `prepare-static` + copy to `deploy/` to test production URLs.

If a hashed asset returns 404, restarting Node will not fix it — run `scripts/deploy-static.sh` or check nginx aliases point to `deploy/`.

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
- Player pages: `/v/:id`, `/a/:id` (`:id` is the public video `uid`, not the internal YouTube id)
- Authorized media entrypoints: `/media/v/:id`, `/media/a/:id`, `/t/:id` (same public `uid`; Node resolves to on-disk `{youtube_id}.*` files)
- API: `/api/download`, `/api/sidebar/mode`, `/api/channel`, `/api/video`, `/api/channel/display-name`, `/api/channel/tags`, `/api/channel/auto-download`, `/api/channel/guest-visible`, `/api/channel/rss-enabled`, `/api/channel/reorder`, `/api/tag/reorder`, `/api/tag/delete`, `/api/admin/...`, `/api/status`, `/api/since`, `/api/feed/cards`

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
- `POST /api/channel/rss-enabled`
- `POST /api/channel/reorder`
- `POST /api/tag/reorder`
- `POST /api/tag/delete`
- `POST /api/admin/video/files/delete`
- `POST /api/admin/video/delete`
- `POST /api/admin/job/delete`
- `POST /api/admin/video/status/reset`
- `POST /api/admin/user/role`

Guest-visible routes:

- `GET /`, `/feed`, `/feed/:tag` render every catalog card from channels with `guest_visible = 1`, regardless of media readiness. The sidebar shows an All link, guest-visible channels, and tags that have catalog cards on those channels. Guest requests to `/feed/ready` or `/feed/manual` redirect to `/feed`.
- `GET /channel/:id` renders only when the channel has `guest_visible = 1`.
- `GET /v/:id`, `/a/:id`, `/media/v/:id`, `/media/a/:id` are public only for videos in guest-visible channels and only when the requested media kind is `ready`. `:id` is the public `uid`.
- `GET /t/:id`, `GET /api/status`, and `GET /api/feed/cards` are public only for guest-visible channel data. Client APIs use `uid`, not `youtubeId`.
- `POST /api/download` allows guests to queue video or audio for videos in guest-visible channels. The endpoint is idempotent for media already queued, downloading, or ready and is rate-limited by nginx per client IP.

Authenticated user routes:

- Full feed/channel/player pages, including private channels and non-public tags.
- Authorized media entrypoints for private or not-yet-public media: `/media/v/:id`, `/media/a/:id`, `/t/:id`.
- `POST /api/download` for video or audio, subject to the same nginx per-IP rate limit.
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

- `POST /api/download` accepts `{ uid, type }`, resolves the internal `youtube_id`, and queues only media in `none` or `expired` status. Requests for media already queued, downloading, or ready return the current status without creating another job. Guests and authenticated users may request video or audio; guest requests are limited to guest-visible channels.
- `POST /api/sidebar/mode` stores the feed sidebar mode in session data.
- `GET /api/status?ids=...` returns current DB media statuses for polling (comma-separated public `uid`s).
- `GET /api/since?...` returns new videos since a timestamp for feed updates.
- `GET /api/feed/cards?...` returns one paginated card collection page for feed controls.
- `POST /api/channel/rss-enabled` stores whether the worker should include a channel in periodic RSS polling. Initial explicit channel crawling is unaffected.

## Protected Media Flow

Raw media files are not public through `/media/` paths. The flow is:

```text
browser -> /media/v/:uid or /media/a/:uid or /t/:uid
nginx -> Node handler
Node -> require session (or guest-visible access)
Node -> resolve uid -> internal youtube_id
Node -> responds with X-Accel-Redirect: /protected_media/.../{youtube_id}.*
nginx -> internal /protected_media/ alias -> media file bytes
```

Relevant Node handlers are in `src/handlers/video.ts`:

```ts
X-Accel-Redirect: /protected_media/videos/{youtube_id}.mp4
X-Accel-Redirect: /protected_media/audio/{youtube_id}.m4a
X-Accel-Redirect: /protected_media/thumbs/{youtube_id}.jpg
```

`/protected_media/` must be `internal` in nginx so clients cannot bypass Node authorization.

## Deployment Notes

Deployment commands and git/rsync workflows live in `docs/deploy.md`.

For a fresh host, `setup.sh` runs the dependency installer and then the host configurator. Together they create:

- runtime directories including `deploy/`
- the dedicated `vidium` service account, root-owned code/runtime, private `.env`/database, and group-readable media for nginx
- nginx site config with `/api/download` and `/api/play` rate limits, `/static/`, `/engine/`, `/parts/` aliases to `deploy/`, plus `/protected_media/`
- systemd units for `vidium-server`, `vidium-worker`, and the `vidium-proxy-check` service/timer
- pinned Node.js and `yt-dlp` through `scripts/setup/install-dependencies.sh`

The worker handles `SIGTERM`/`SIGINT` by stopping its timers and waiting for the active job and RSS poll. Its unit uses `KillMode=mixed` with `TimeoutStopSec=30min`, so systemd signals the worker first and kills the whole control group only after the grace period. If a forced stop leaves a job in `processing`, startup returns it to `pending` without consuming a retry. Thumbnails are written to a `.part` file and atomically renamed.

Do not rerun `setup.sh` or `scripts/setup/apply-host-config.sh` just to add the download rate limit or fix a missing `/engine/` or `/parts/` alias on an existing server. In particular, the generated nginx template must not replace a Certbot-managed site unless that replacement is intentional and `--force-nginx` is supplied. For targeted nginx changes, edit the active site config directly, then run:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Restart Node only for application code changes. Reload nginx for nginx config changes.
