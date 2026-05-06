# Deployment

vidium supports two deployment styles:

- Git-based deployment on the VPS.
- rsync deployment from a local working tree.

Both are valid. Use git when the VPS should pull a known repository state. Use rsync when the local checkout is the source of truth and you want to copy only runtime-relevant files.

## Runtime Files

The VPS app directory is usually `/root/vidium`.

Files that should exist on the VPS for runtime:

- `src/`
- `package.json`
- `.env`
- `data/`
- `media/`
- `cookies.txt` if `YTDLP_COOKIES` points to it
- `static` symlink pointing to `src/static`, created by `setup.sh`

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
bash setup.sh
nano .env
systemctl enable --now vidium-server vidium-worker
```

For HTTPS:

```bash
certbot --nginx -d your-domain.com
```

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
bash setup.sh
nano .env
systemctl enable --now vidium-server vidium-worker
```

`setup.sh` prepares the machine: installs system packages, creates `.env`, `data/`, `media/`, the `static` symlink, nginx config, and systemd services. Do not use it as a normal code deploy command.

After setup, deploy the application files with rsync.

### Subsequent rsync deploy

From the local machine:

```bash
rsync -av --delete \
  --include='/src/***' \
  --include='/package.json' \
  --exclude='*' \
  ~/<project_path>/vidium/ \
  root@<VPS_IP>:/root/vidium/
```

Then restart Node services on the VPS:

```bash
ssh root@<VPS_IP> 'systemctl restart vidium-server vidium-worker'
```

This rsync command deletes stale files only inside the included deploy set. It does not delete excluded persistent directories such as `data/` and `media/`.

## Optional rsync With Scripts

If you want `scripts/import-channels.ts` and `scripts/channels.txt` available on the VPS, include `scripts/` too:

```bash
rsync -av --delete \
  --include='/src/***' \
  --include='/scripts/***' \
  --include='/package.json' \
  --exclude='*' \
  ~/<project_path>/vidium/ \
  root@<VPS_IP>:/root/vidium/
```

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

## Checks After Deploy

```bash
ssh root@<VPS_IP> 'systemctl status vidium-server vidium-worker --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-server -n 50 --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-worker -n 50 --no-pager'
```
