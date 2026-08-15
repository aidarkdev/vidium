# Deployment

vidium supports two deployment styles:

- Git-based deployment on the VPS.
- rsync deployment from a local working tree.

Both are valid. Use git when the VPS should pull a known repository state. Use rsync when the local checkout is the source of truth and you want to copy only runtime-relevant files.

## Runtime Files

The production app directory is `/opt/vidium`. Application services run as the dedicated unprivileged `vidium` account; code and the pinned runtime remain root-owned.

Files that should exist on the VPS for runtime:

- `src/`
- `scripts/check-proxy-status.ts`
- one-time migration scripts from `scripts/` when a release note tells you to run them
- `package.json`
- `.env`
- `data/`
- `media/`
- `cookies.txt` if `YTDLP_COOKIES` points to it
- `runtime/node` — pinned Node.js runtime installed by `setup.sh`
- `deploy/` — content-hashed browser assets and `asset-manifest.json`, built locally by `scripts/prepare-static.ts` and rsynced by `scripts/deploy-static.sh`

`package.json` is needed for Node module mode because it contains `"type": "module"`. It is not used as an npm dependency manifest.

Files that are not needed for runtime:

- `node_modules/`
- `.git/` if you use rsync deployment
- docs and development scripts, unless you want them available on the VPS
- TypeScript/Biome configs, unless you run checks on the VPS

Persistent files must not be overwritten or deleted by application deploys:

- `.env`
- `data/`
- `media/`
- cookies file used by `YTDLP_COOKIES`

## First Deploy With Git

Use this for a clean VPS or when you want the server to manage code through git.

```bash
ssh root@<VPS_IP>
git clone https://github.com/aidarkdev/vidium /opt/vidium
cd /opt/vidium
bash setup.sh your-domain.com
nano .env
systemctl enable --now vidium-server vidium-worker vidium-proxy-check.timer
```

`setup.sh` installs the pinned Node.js and `yt-dlp` versions declared in the script. To update either tool, review the upstream release, bump the version and sha256 in `setup.sh`, deploy that change, run setup or install the verified binary manually, then restart the affected services.

For HTTPS:

```bash
certbot --nginx -d your-domain.com
```

## First Admin

New registrations receive the `user` role. After the first account is registered, grant admin role once from the VPS:

```bash
cd /opt/vidium
./runtime/node/bin/node --env-file=.env -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.DB_PATH); db.prepare('UPDATE users SET role = ? WHERE login = ?').run('admin', 'YOUR_LOGIN');"
```

Replace `YOUR_LOGIN` with the login used in vidium. Check roles:

```bash
./runtime/node/bin/node --env-file=.env -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.DB_PATH); console.log(db.prepare('SELECT id, login, role FROM users').all());"
```

After one admin exists, manage other admin roles from `/admin`.

## Subsequent Git Deploy

On the VPS:

```bash
cd /opt/vidium
git pull
systemctl restart vidium-server vidium-worker
```

Reload nginx only if nginx config changed:

```bash
nginx -t && systemctl reload nginx
```

When deploying API rate limits to an existing VPS, update the active nginx site config manually before reloading nginx:

- Add `limit_req_zone $binary_remote_addr zone=download_requests:10m rate=5r/m;` in the `http` context, immediately before the site's `server {}` block when using the generated site-file layout.
- Add the exact `location = /api/download` proxy from `docs/server-runtime.md`, including `burst=4`, `nodelay`, and `limit_req_status 429`.
- Add the `play_requests` zone and exact `location = /api/play` from `docs/server-runtime.md`.
- Run `nginx -t` before `systemctl reload nginx`.

Do not rerun `setup.sh` only to apply this nginx change.

## Migrating An Existing `/root/vidium` Install

Do not rerun `setup.sh`: an existing certbot-managed nginx file must be preserved. Stage code and the pinned runtime under `/opt/vidium`, then use one maintenance window for the persistent-state move.

Before stopping anything:

- Confirm `/root/vidium` and `/opt` have the same filesystem device. If they differ, an atomic metadata-only move is impossible; stop and arrange enough backup space first.
- Save copies of `.env`, `data/`, the configured cookies file, the active nginx site, and all vidium systemd units off the VPS.
- Record database row counts, job status counts, and media file counts.
- Prepare the `vidium` account, root-owned code/runtime, updated units, and an nginx candidate that retains all certbot TLS directives and changes only application paths/rate-limit locations.

During the maintenance window:

1. Stop `vidium-proxy-check.timer`, `vidium-server`, and `vidium-worker`. The worker may take up to 30 minutes to finish its active job.
2. Run `PRAGMA wal_checkpoint(TRUNCATE)` and `PRAGMA quick_check` against the stopped database.
3. Atomically move `data/` and `media/` from `/root/vidium` to `/opt/vidium`; copy `.env` and update absolute paths to `/opt/vidium`.
4. Apply the ownership and modes documented below, install the prepared units/nginx file, run `systemctl daemon-reload` and `nginx -t`.
5. Start the server first and verify the login/feed and database counts. Then start the worker and proxy timer and verify job statuses and media access.

Keep the old root-owned code, old `.env`, unit files, and nginx file until post-deploy checks pass. Rollback consists of stopping the new units, moving `data/` and `media/` back on the same filesystem, restoring the saved units/nginx file, and starting the old services. The aggregate play-count table is ignored by old code; play events accumulated only after the upgrade are intentionally not part of the rollback guarantee.

Production permissions:

- `/opt/vidium`, source, runtime, and deploy files: `root:vidium`, directories `0750`, files `0640` (executables retain execute permission).
- `.env` and any configured cookies file: `vidium:vidium`, `0600`.
- `data/`: `vidium:vidium`, directories `0700`, files `0600`.
- `media/`: `vidium:vidium`, directories `2750`, files `0640`; nginx's `www-data` account belongs to the `vidium` group.

## rsync Deploy From Local Checkout

Use this when local files are the source of truth and the VPS should receive only runtime-relevant files.

### First rsync-based deploy

On a fresh VPS, create the application directory and copy the runtime source plus the bootstrap script:

```bash
ssh root@<VPS_IP> 'mkdir -p /opt/vidium'
rsync -av \
  --include='/setup.sh' \
  --include='/src/***' \
  --include='/scripts/***' \
  --include='/package.json' \
  --exclude='*' \
  ~/<project_path>/vidium/ \
  root@<VPS_IP>:/opt/vidium/
```

Run setup once on the VPS:

```bash
ssh root@<VPS_IP>
cd /opt/vidium
bash setup.sh your-domain.com
nano .env
systemctl enable --now vidium-server vidium-worker vidium-proxy-check.timer
```

`setup.sh` prepares the machine: installs system packages, creates `.env`, `data/`, `media/`, `deploy/`, nginx config, and systemd services. Do not use it as a normal code deploy command.

After setup, deploy application source with rsync, then deploy hashed browser assets (see below).

### Subsequent rsync deploy

From the local machine:

```bash
rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
  --include='/src/***' \
  --include='/scripts/' \
  --include='/scripts/check-proxy-status.ts' \
  --include='/package.json' \
  --exclude='*' \
  ~/<project_path>/vidium/ \
  root@<VPS_IP>:/opt/vidium/
```

Then deploy hashed browser assets and restart Node services:

```bash
~/<project_path>/vidium/scripts/deploy-static.sh root@<VPS_IP>
```

Or run the steps separately:

```bash
node ~/<project_path>/vidium/scripts/prepare-static.ts
rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
  ~/<project_path>/vidium/tmp/vidium-static/ \
  root@<VPS_IP>:/opt/vidium/deploy/
ssh root@<VPS_IP> 'systemctl restart vidium-server vidium-worker'
```

### One-time video chapters migration

For the release that adds player chapters to existing VPS installs, deploy
`scripts/migrate-video-chapters.ts` and run:

```bash
cd /opt/vidium
./runtime/node/bin/node --env-file=.env --experimental-sqlite scripts/migrate-video-chapters.ts
systemctl restart vidium-server vidium-worker
```

This rsync command deletes stale files only inside the included deploy set. It does not delete excluded persistent directories such as `data/` and `media/`.

## Optional rsync With Import Scripts

If you want `scripts/import-channels.ts` and `scripts/channels.txt` available on the VPS, include those scripts too:

```bash
rsync -av --delete \
  --include='/src/***' \
  --include='/scripts/' \
  --include='/scripts/***' \
  --include='/package.json' \
  --exclude='*' \
  ~/<project_path>/vidium/ \
  root@<VPS_IP>:/opt/vidium/
```

## Static Asset Deploy

Browser assets (`/engine/`, `/parts/`, `/static/`) are content-hashed at deploy time so nginx can serve them with long-lived immutable caching. The Node server reads `deploy/asset-manifest.json` and emits hashed URLs in HTML.

Prepare locally (writes to `tmp/vidium-static/`):

```bash
node scripts/prepare-static.ts
# or: npm run prepare:static
```

Deploy prepared assets to the VPS:

```bash
scripts/deploy-static.sh root@<VPS_IP>
```

Full rsync deploy sequence:

1. rsync `src/` and `package.json` (commands above)
2. `scripts/deploy-static.sh root@<VPS_IP>`

Git-based VPS deploys still need a local static deploy step — run `deploy-static.sh` from your checkout after `git pull` on the VPS updates server code.

Optional env override: `ASSET_MANIFEST_PATH` in `.env` (default: `<app>/deploy/asset-manifest.json`).

### Migrating an existing VPS to hashed assets

1. Deploy updated server code (`src/` rsync or `git pull`).
2. Edit the nginx site config: point `/static/`, `/engine/`, and `/parts/` aliases to `${APP_DIR}/deploy/` and set `Cache-Control: public, max-age=31536000, immutable`. See `setup.sh` for the current template.
3. `nginx -t && systemctl reload nginx`
4. Run `scripts/deploy-static.sh root@<VPS_IP>` from your local checkout.

Remove any old `static` → `src/static` symlink; it is no longer used.

## Static Assets And nginx

Browser modules under `/engine/`, `/parts/`, and `/static/` are served by nginx aliases. Restarting Node does not fix 404s for those files.

If nginx config changed:

```bash
ssh root@<VPS_IP> 'nginx -t && systemctl reload nginx'
```

If only `src/` changed:

```bash
ssh root@<VPS_IP> 'systemctl restart vidium-server vidium-worker'
```

If browser JS/CSS/images changed, also run `scripts/deploy-static.sh` locally — restarting Node alone does not update hashed files under `deploy/`.

## Checks After Deploy

```bash
ssh root@<VPS_IP> 'systemctl status vidium-server vidium-worker --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-server -n 50 --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-worker -n 50 --no-pager'
```
