# vidium — setup guide

## 1. System setup

The supported bootstrap platform is a fresh Ubuntu 24.04 x86_64 system. The setup script exits before downloads or system changes on any other architecture.

Copy the bootstrap files with the first-deploy rsync command from `docs/deploy.md`, then run the setup script on the VPS:

```bash
cd /opt/vidium
sudo bash setup.sh your-domain.com
```

To let setup configure UFW explicitly, pass the SSH port that must remain open, for example `--configure-firewall=2222`. Without that option setup does not change UFW. Use `--force-nginx` only when intentionally replacing an existing site; it creates timestamped backups, but the generated template does not preserve Certbot directives.

The domain can alternatively be supplied through the environment: `DOMAIN=your-domain.com sudo -E bash setup.sh`.

The wrapper:

- Runs `apt update` without a full OS upgrade
- Installs pinned Node.js 24 from the official release tarball, pinned yt-dlp, and Ubuntu-packaged nginx, certbot, and curl
- Creates `data/` and `media/` directories with correct ownership
- Sets up nginx config with static file serving and media proxy
- Creates the unprivileged `vidium` system account and systemd units configured to run as it
- Creates `.env` only when it is absent; an existing file is preserved and its owner/mode are corrected
- Leaves the vidium services stopped until they are explicitly enabled below

## 2. Configure `.env`

```bash
nano .env
```

`scripts/setup/apply-host-config.sh` generates the runtime values below. `PORT` and `HOST`
are fixed because nginx proxies to the same private endpoint; changing either value is rejected
at application startup.

| Variable | Required | Generated value / default | Purpose and when to change |
|---|---|---|---|
| `PORT` | Yes | `3000` | Fixed internal Node port; do not change. |
| `HOST` | Yes | `127.0.0.1` | Fixed loopback bind address; do not change. |
| `DB_PATH` | Yes | `<app>/data/vidium.db` | SQLite database path. Update only when intentionally moving persistent data. |
| `MEDIA_DIR` | Yes | `<app>/media` | Video, audio, and thumbnail root. Update only when intentionally moving media. |
| `DISK_HIGH_WATERMARK` | Yes | `0.80` | Disk usage from `0` to `1` at which cleanup starts. Must exceed the low watermark. |
| `DISK_LOW_WATERMARK` | Yes | `0.60` | Cleanup target from `0` to `1`. Must be lower than the high watermark. |
| `YTDLP_PROXY` | No | Empty | Optional SOCKS/HTTP proxy used by yt-dlp. |
| `PROXY_STATUS_PATH` | With proxy | `<app>/data/proxy-status.json` | Status file written by the proxy-check timer; required when `YTDLP_PROXY` is set. |
| `YTDLP_COOKIES` | No | Empty | Optional cookies file for age-restricted content. |
| `CRAWL_INITIAL` | Yes | `15` | Positive integer limiting the first explicit channel crawl. |
| `INVITE_CODE` | Yes | Randomly generated | Secret required for registration. Keep it private. |
| `SESSION_MAX_AGE` | Yes | `604800000` | Positive integer session lifetime in milliseconds. |
| `DEFAULT_LANG` | Yes | `ru` | Default UI and YouTube metadata language; supported values are `en` and `ru`. |
| `ASSET_MANIFEST_PATH` | No | `<app>/deploy/asset-manifest.json` | Optional override for the prepared browser asset manifest. |

The domain is deployment input for nginx and Certbot, not an application runtime variable.
Pass it to `setup.sh` as shown above. Legacy `.env` entries named `DOMAIN` or `YTDLP_SLEEP`
are ignored and may be removed during normal configuration maintenance.

If you configure a cookies file, make it readable only by the service account: `sudo chown vidium:vidium /path/to/cookies.txt` and `sudo chmod 0600 /path/to/cookies.txt`.

## 3. Start services

```bash
sudo systemctl enable --now vidium-server vidium-worker vidium-proxy-check.timer
```

Check status:

```bash
sudo systemctl status vidium-server vidium-worker vidium-proxy-check.timer
```

View logs:

```bash
sudo journalctl -u vidium-server -f   # server
sudo journalctl -u vidium-worker -f   # worker (crawling, downloads)
```

## 4. Register and log in

Open `http://localhost` in your browser. You'll be redirected to `/login`.

1. Click the register link
2. Enter the invite code from `.env`
3. Pick a 3–64 character login without surrounding spaces and a 12–1024 character password

## 5. Add channels

### From the UI

On the feed page, click **"Add channel"**, paste a YouTube channel URL (`https://www.youtube.com/@name`), optionally add comma-separated tags, and submit. The worker starts crawling immediately.

### From the CLI (bulk import)

Create a channels file — one channel per line, tab-separated fields:

```
# channels.txt
https://www.youtube.com/@lexfridman	Lex Fridman	podcast,interview
https://www.youtube.com/@ThePrimeTimeagen/streams	ThePrimeTime	streams,dev
```

Format: `url<TAB>display name<TAB>tag1,tag2`. Display name and tags are optional.

Run:

```bash
./runtime/node/bin/node --env-file=.env scripts/import-channels.ts
```

Watch progress:

```bash
sudo journalctl -u vidium-worker -f
```

After crawling finishes (1-3 minutes per channel), refresh the page — video cards with thumbnails will appear.

## 6. Using vidium

- **Feed** — shows all videos sorted by date, filterable by tags
- **Download** — click "Download video" or "Download audio" on any card; the worker downloads in the background
- **Watch/Listen** — once downloaded, buttons change to "Watch" / "Listen" for streaming through the browser
- **Auto-update** — RSS polling runs every 30 minutes to pick up new uploads

## 7. HTTPS (production)

Point DNS to your server, then:

```bash
sudo certbot --nginx -d your-domain.com
```

## Troubleshooting

**Services won't start** — check logs: `sudo journalctl -u vidium-server -n 50`

**Crawling fails** — YouTube may block requests. Set `YTDLP_PROXY` in `.env`. If yt-dlp needs an update, review the upstream release, update `YTDLP_VERSION` and `YTDLP_SHA256` in `scripts/setup/dependency-versions.sh`, deploy the change, run the dependency installer, then restart `vidium-worker`.

**Node.js needs an update** — review the upstream release, update `NODE_VERSION` and `NODE_SHA256` in `scripts/setup/dependency-versions.sh`, deploy the change, run the dependency installer on the VPS, then restart `vidium-server` and `vidium-worker`.

**Downloads fail** — check disk space. vidium auto-cleans old media when disk usage exceeds `DISK_HIGH_WATERMARK`.

**Permission errors** — ensure `data/` and `media/` are owned by the service account: `sudo chown -R vidium:vidium data media`
