# Deployment

vidium supports two deployment styles:

- Git-based deployment on the VPS.
- rsync deployment from a local working tree.

Both are valid. Use git when the VPS should pull a known repository state. Use rsync when the local checkout is the source of truth and you want to copy only runtime-relevant files.

## Runtime Files

The VPS app directory is usually `/root/vidium`.

Files that should exist on the VPS for runtime:

- `src/`
- `scripts/check-proxy-status.ts`
- one-time migration scripts from `scripts/` when a release note tells you to run them
- `package.json`
- `.env`
- `data/`
- `media/`
- `cookies.txt` if `YTDLP_COOKIES` points to it
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
git clone https://github.com/aidarkdev/vidium /root/vidium
cd /root/vidium
bash setup.sh your-domain.com
nano .env
systemctl enable --now vidium-server vidium-worker vidium-proxy-check.timer
```

For HTTPS:

```bash
certbot --nginx -d your-domain.com
```

## First Admin

New registrations receive the `user` role. After the first account is registered, grant admin role once from the VPS:

```bash
cd /root/vidium
node --env-file=.env -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.DB_PATH); db.prepare('UPDATE users SET role = ? WHERE login = ?').run('admin', 'YOUR_LOGIN');"
```

Replace `YOUR_LOGIN` with the login used in vidium. Check roles:

```bash
node --env-file=.env -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.DB_PATH); console.log(db.prepare('SELECT id, login, role FROM users').all());"
```

After one admin exists, manage other admin roles from `/admin`.

## Subsequent Git Deploy

On the VPS:

```bash
cd /root/vidium
git pull
systemctl restart vidium-server vidium-worker
```

Reload nginx only if nginx config changed:

```bash
nginx -t && systemctl reload nginx
```

## rsync Deploy From Local Checkout

Use this when local files are the source of truth and the VPS should receive only runtime-relevant files.

### First rsync-based deploy

On a fresh VPS, copy the bootstrap script first:

```bash
rsync -av ~/<project_path>/vidium/setup.sh root@<VPS_IP>:/root/vidium/setup.sh
```

Run setup once on the VPS:

```bash
ssh root@<VPS_IP>
cd /root/vidium
bash setup.sh your-domain.com
nano .env
systemctl enable --now vidium-server vidium-worker vidium-proxy-check.timer
```

`setup.sh` prepares the machine: installs system packages, creates `.env`, `data/`, `media/`, `deploy/`, nginx config, and systemd services. Do not use it as a normal code deploy command.

After setup, deploy application source with rsync, then deploy hashed browser assets (see below).

### Subsequent rsync deploy

From the local machine:

```bash
rsync -av --delete \
  --include='/src/***' \
  --include='/scripts/' \
  --include='/scripts/check-proxy-status.ts' \
  --include='/package.json' \
  --exclude='*' \
  ~/<project_path>/vidium/ \
  root@<VPS_IP>:/root/vidium/
```

Then deploy hashed browser assets and restart Node services:

```bash
~/<project_path>/vidium/scripts/deploy-static.sh root@<VPS_IP>
```

Or run the steps separately:

```bash
node ~/<project_path>/vidium/scripts/prepare-static.ts
rsync -av --delete \
  ~/<project_path>/vidium/tmp/vidium-static/ \
  root@<VPS_IP>:/root/vidium/deploy/
ssh root@<VPS_IP> 'systemctl restart vidium-server vidium-worker'
```

### One-time video chapters migration

For the release that adds player chapters to existing VPS installs, deploy
`scripts/migrate-video-chapters.ts` and run:

```bash
cd /root/vidium
node --env-file=.env --experimental-sqlite scripts/migrate-video-chapters.ts
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
  root@<VPS_IP>:/root/vidium/
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
