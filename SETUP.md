# vidium — setup guide

## 1. System setup

Clone the repo and run the setup script from the project directory:

```bash
git clone <repo> ~/vidium
cd ~/vidium
sudo bash setup.sh
```

The script:
- Installs Node.js 24, nginx, certbot, yt-dlp
- Creates `data/` and `media/` directories with correct ownership
- Sets up nginx config with static file serving and media proxy
- Creates systemd services (`vidium-server`, `vidium-worker`) running as your user
- Generates `.env` template with paths matching the project location

## 2. Configure .env

```bash
nano .env
```

Key settings to change:

| Variable | Description |
|---|---|
| `INVITE_CODE` | Secret code for user registration (change from `changeme`) |
| `DOMAIN` | Your domain or `localhost` for local testing |
| `DEFAULT_LANG` | `en` or `ru` |
| `YTDLP_PROXY` | Optional SOCKS/HTTP proxy for yt-dlp |
| `YTDLP_COOKIES` | Optional path to cookies file for age-restricted content |

## 3. Start services

```bash
sudo systemctl enable --now vidium-server vidium-worker
```

Check status:

```bash
sudo systemctl status vidium-server vidium-worker
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
3. Pick a login and password

## 5. Add channels

### From the UI

On the feed page, click **"Add channel"**, paste a YouTube channel URL (`https://www.youtube.com/@name`), optionally add comma-separated tags, and submit. The worker starts crawling immediately.

### From the CLI (bulk import)

Create a channels file — one channel per line, optional tags separated by whitespace:

```
# channels.txt
https://www.youtube.com/@lexfridman      podcast
```

Run:

```bash
node --env-file=.env scripts/import-channels.ts channels.txt
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

Update `DOMAIN` in `.env` and restart:

```bash
sudo systemctl restart vidium-server
```

## Troubleshooting

**Services won't start** — check logs: `sudo journalctl -u vidium-server -n 50`

**Crawling fails** — YouTube may block requests. Set `YTDLP_PROXY` in `.env` or update yt-dlp: `sudo yt-dlp -U`

**Downloads fail** — check disk space. vidium auto-cleans old media when disk usage exceeds `DISK_HIGH_WATERMARK`.

**Permission errors** — ensure `data/` and `media/` are owned by your user: `sudo chown -R $(whoami) data media`
