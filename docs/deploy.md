# Deployment

vidium is deployed with rsync from a clean local checkout. The local machine builds the content-hashed browser assets and sends both server code and assets from the same verified commit. The VPS is not a Git checkout and does not need Git.

The supported bootstrap platform is Ubuntu 24.04 x86_64. Both `setup.sh` and `dev-env-setup.sh` reject other architectures before downloads or machine changes.

## CI/CD Branch Policy

`master` is the current primary CI/CD branch. GitHub Actions runs the `quality`
workflow for pull requests targeting `master` and for pushes to `master`.

Production deployment is also tied to `master`: `scripts/deploy.sh` and
`scripts/deploy-static.sh` require a clean checkout whose `HEAD` matches the
current `origin/master`, then require a successful GitHub Actions `quality`
check for that exact commit before changing the VPS. A different local branch
or revision must not be deployed through the supported scripts.

If the primary branch changes in the future, update the GitHub Actions workflow,
deployment scripts, and this documentation together.

## Runtime And Maintenance Files

The production app directory is `/opt/vidium`. Application services run as the dedicated unprivileged `vidium` account; code and the pinned runtime remain root-owned.

Files that should exist on the VPS for the application runtime and supported deployment/maintenance workflows:

- `src/`
- `setup.sh` and `scripts/setup/` for bootstrap and explicit runtime updates
- `scripts/check-proxy-status.ts`
- `scripts/runtime-inventory.sh`
- one-time migration scripts from `scripts/` when a release note tells you to run them
- `package.json`
- `.env`
- `data/`
- `media/`
- `cookies.txt` if `YTDLP_COOKIES` points to it
- `runtime/node` — pinned Node.js runtime installed by `scripts/setup/install-dependencies.sh` directly or through `setup.sh`
- `deploy/` — content-hashed browser assets and `asset-manifest.json`, built locally by `scripts/prepare-static.ts` and delivered by the deploy scripts
- `.deployed-revision` — commit SHA written after successful service and HTTP checks

`package.json` is needed for Node module mode because it contains `"type": "module"`. It is not used as an npm dependency manifest.

Files that are not needed for runtime:

- `node_modules/`
- `.git/`
- docs and development scripts, unless you want them available on the VPS
- TypeScript/Biome configs, unless you run checks on the VPS

Persistent files must not be overwritten or deleted by application deploys:

- `.env`
- `data/`
- `media/`
- cookies file used by `YTDLP_COOKIES`

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

## nginx Configuration Updates

Reload nginx only if its configuration changed:

```bash
nginx -t && systemctl reload nginx
```

When deploying API rate limits to an existing VPS, update the active nginx site config manually before reloading nginx:

- Add `limit_req_zone $binary_remote_addr zone=download_requests:10m rate=5r/m;` in the `http` context, immediately before the site's `server {}` block when using the generated site-file layout.
- Add the exact `location = /api/download` proxy from `docs/server-runtime.md`, including `burst=4`, `nodelay`, and `limit_req_status 429`.
- Add the `play_requests` zone and exact `location = /api/play` from `docs/server-runtime.md`.
- Run `nginx -t` before `systemctl reload nginx`.

Do not rerun `setup.sh` only to apply this nginx change.

## Updating Node.js Or yt-dlp

Runtime updates do not require reapplying host configuration. Review the upstream release, update the corresponding version and SHA256 in `scripts/setup/dependency-versions.sh`, deploy `scripts/setup/`, then run:

```bash
cd /opt/vidium
sudo bash scripts/setup/install-dependencies.sh
```

Restart `vidium-worker` after a yt-dlp update. Restart both `vidium-server` and `vidium-worker` after a Node.js update. The dependency installer does not write the vidium nginx site or vidium systemd units and does not modify UFW, `.env`, or persistent data directories.

## Migrating An Existing `/root/vidium` Install

Do not rerun `setup.sh` or `scripts/setup/apply-host-config.sh`: an existing Certbot-managed nginx file must be preserved. The host configurator refuses to replace an existing site unless `--force-nginx` is passed, and its generated template does not retain Certbot TLS directives. Stage code and the pinned runtime under `/opt/vidium`, then use one maintenance window for the persistent-state move.

This workflow supports databases that already use the normalized `tags` and `channel_tags`
tables. Databases whose channel tags exist only in the legacy `channels.tags` column are outside
the supported upgrade path; this repository does not provide a legacy tag migration.

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

## Deploy From A Local Checkout

The local checkout is the source of truth. Ordinary deployment uses `scripts/deploy.sh`, which refuses a dirty checkout, requires `HEAD` to match `origin/master`, verifies the successful GitHub Actions `quality` check for that commit, builds browser assets locally, and sends only runtime-relevant files.

Local deployment prerequisites are Git, the pinned development Node.js, rsync, and SSH. Git is required only on the local machine; it is not installed on the VPS.

### First deploy

On a fresh VPS, create the application directory and copy the runtime source plus the bootstrap script:

```bash
ssh root@<VPS_IP> 'mkdir -p /opt/vidium'
rsync -av \
  --include='/setup.sh' \
  --include='/src/***' \
  --include='/scripts/' \
  --include='/scripts/setup/***' \
  --include='/scripts/check-proxy-status.ts' \
  --include='/scripts/runtime-inventory.sh' \
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
exit
```

`setup.sh` prepares the machine by running both helper scripts: it installs system/runtime dependencies, then creates `data/`, `media/`, `deploy/`, nginx config, systemd units, and `.env` when that file is absent. An existing `.env` is preserved. The first copy must contain `setup.sh`, `scripts/setup/install-dependencies.sh`, and `scripts/setup/apply-host-config.sh`. Do not use the wrapper or host configurator as a normal code deploy command.

After setup, leave the SSH session and deploy the complete verified revision from the local checkout:

```bash
scripts/deploy.sh root@<VPS_IP>
ssh root@<VPS_IP> 'systemctl enable --now vidium-server vidium-worker vidium-proxy-check.timer'
```

For HTTPS, point DNS to the VPS and run `certbot --nginx -d your-domain.com` on the VPS.

### Subsequent deploy

Run from the local project root:

```bash
scripts/deploy.sh root@<VPS_IP>
```

The script builds static assets before changing the VPS, rsyncs server code and the prepared assets, restarts `vidium-server` and `vidium-worker`, verifies both units and the local HTTP endpoint, then writes the deployed commit to `/opt/vidium/.deployed-revision`. The source rsync deletes stale files only inside the allowlisted deploy set; excluded persistent files and directories such as `.env`, `data/`, and `media/` are not deleted.

## Cinema Storage And Manual Transfer

Fresh setup creates `media/cinema/`. For an existing VPS, after backing up SQLite
and deploying the checked release, create only this directory (do **not** rerun
setup or replace a Certbot-managed nginx site). Substitute the actual `MEDIA_DIR`
from your deployment if it differs:

```bash
sudo install -d -o vidium -g vidium -m 2750 /opt/vidium/media/cinema
```

This step is idempotent. First verify that the media root and its parents are
trusted real directories, not symlinks. nginx's `www-data` must already belong to
`vidium`; the app/root directories must allow group traversal but not group writes
by nginx. Final files use `vidium:vidium`, mode `0640`. The SQLite bootstrap adds
only an independent table and index; it does not rewrite existing videos.
Ordinary deploy excludes all of `media/`, including Cinema and `.part` files.
Cleanup scans only `videos/` and `audio/`, never Cinema.

Create an entry in `/cinema` as admin. Substitute its generated `UID`, your SSH
target and local browser-ready MP4. From the local machine:

```bash
rsync -avP './film.mp4' root@VPS:/opt/vidium/media/cinema/UID.mp4.part
```

Only after rsync succeeds, on the VPS:

```bash
chown vidium:vidium /opt/vidium/media/cinema/UID.mp4.part
chmod 0640 /opt/vidium/media/cinema/UID.mp4.part
mv -n /opt/vidium/media/cinema/UID.mp4.part /opt/vidium/media/cinema/UID.mp4
test ! -e /opt/vidium/media/cinema/UID.mp4.part
```

`mv -n` must not overwrite an existing final file. Verify that `.part` disappeared:
its exit status alone is insufficient. A same-directory rename is atomic, does
not transcode, and does not create a second full copy. Refresh the catalog after
rename. A `.part` is never playable; repeat rsync after an interrupted transfer.

Root SSH is only an example of the existing workflow, not a requirement. For a
regular SSH operator, an administrator must arrange narrowly authorized sudo or
directory write permissions without giving `www-data` write access. For example,
transfer to the operator's private staging directory, then use authorized sudo to
rsync into the expected `.mp4.part`, chown/chmod and rename there. Staging may need
extra disk space; do not grant a shell to the `vidium` service account. Do not store
SSH hosts, keys or passwords in the app.

Films and unfinished transfers are not auto-cleaned and may fill the disk. Monitor
the existing disk indicator; delete a record through its Cinema UI or remove stale
`.part` files manually. **Stop rsync/mv before deleting its entry**: an external
transfer can otherwise recreate orphan files after deletion. Orphans are not
served and are not automatically swept. A real deletion error preserves the row
for retry; already-open nginx playback is not guaranteed to stop immediately.

After an authorized production deploy, perform the smoke test in
`docs/cinema-implementation-plan.md`: real MP4 playback/seeking and Range through
nginx, guest denial, direct internal-path denial, private cache headers and delete.
No nginx reload is needed unless its configuration actually changes.

## Optional Maintenance Script Copy

This is not an application deploy. If you specifically need `scripts/import-channels.ts` and `scripts/channels.txt` on the VPS for maintenance, copy them separately:

```bash
rsync -av --chown=root:vidium --chmod=F640 \
  scripts/import-channels.ts scripts/channels.txt \
  root@<VPS_IP>:/opt/vidium/scripts/
```

## Static-only Deploy

Browser assets (`/engine/`, `/parts/`, `/static/`) are content-hashed at deploy time so nginx can serve them with long-lived immutable caching. The Node server reads `deploy/asset-manifest.json` and emits hashed URLs in HTML.

When only browser files changed, use the static-only wrapper:

```bash
scripts/deploy-static.sh root@<VPS_IP>
```

It runs the same clean-checkout, `origin/master`, required-CI, restart, smoke-check, and revision-recording steps as the full deploy, but skips the server-source rsync. Do not use it when server code or runtime scripts changed.

Optional env override: `ASSET_MANIFEST_PATH` in `.env` (default: `<app>/deploy/asset-manifest.json`).

### Migrating an existing VPS to hashed assets

1. Prepare and stage assets without restarting Node:

   ```bash
   node scripts/prepare-static.ts
   rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
     tmp/vidium-static/ root@<VPS_IP>:/opt/vidium/deploy/
   ```

2. Edit the nginx site config: point `/static/`, `/engine/`, and `/parts/` aliases to `${APP_DIR}/deploy/` and set `Cache-Control: public, max-age=31536000, immutable`. See `scripts/setup/apply-host-config.sh` for the current template.
3. Run `nginx -t && systemctl reload nginx`.
4. Run `scripts/deploy.sh root@<VPS_IP>` from the clean local checkout to deploy and verify the complete revision.

Remove any old `static` → `src/static` symlink; it is no longer used.

## Static Assets And nginx

Browser modules under `/engine/`, `/parts/`, and `/static/` are served by nginx aliases. Restarting Node does not fix 404s for those files.

If nginx config changed:

```bash
ssh root@<VPS_IP> 'nginx -t && systemctl reload nginx'
```

For every server-code change, use the complete deployment command:

```bash
scripts/deploy.sh root@<VPS_IP>
```

For a browser-only change, use `scripts/deploy-static.sh` as described above. Restarting Node alone does not update hashed files under `deploy/`.

## Checks After Deploy

```bash
ssh root@<VPS_IP> 'systemctl status vidium-server vidium-worker --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-server -n 50 --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-worker -n 50 --no-pager'
ssh root@<VPS_IP> 'cd /opt/vidium && bash scripts/runtime-inventory.sh' \
  > "vidium-runtime-inventory-$(date -u +%Y%m%dT%H%M%SZ).tsv"
```

`scripts/deploy.sh` already verifies the systemd units and local HTTP endpoint. The commands above provide additional diagnostics and a runtime inventory. The inventory command is read-only, performs no network requests, and does not read `.env`, cookies, or host identity. Run it through `bash` because rsync deploys apply file mode `F640` and do not preserve an executable bit. Keep the resulting TSV as input to a separate CVE check; the inventory script does not assess vulnerabilities or install a scanner. It exits nonzero when a required production component is absent or the platform is unsupported.
