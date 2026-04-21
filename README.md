for some specific reasons, one popular content hosting is not available in one country.
this project gives the way to get content from your own service.

for some specific reasons, one popular content hosting does not like, that some projects try to "crawl" and mirror contents of his own.
So maybe you will need make some movements to not be banned by this popular hosting: `.env` file (will be created after `setup.sh` gets called) already has some "config rows" that can be filled to avoid ban.

---

## Deploying to a VPS

Tested on Ubuntu 24.04. Run all commands as root unless noted.

### First deploy

**1. Clone the repo on the VPS**

```bash
ssh root@<VPS_IP>
git clone https://github.com/aidarkdev/vidium /root/vidium
cd /root/vidium
```

**2. Run the setup script**

```bash
sudo bash setup.sh
```

The script installs Node.js 24, nginx, certbot, "some_cli_tool"; creates `data/` and `media/` directories; sets up nginx config; creates systemd services `vidium-server` and `vidium-worker`; and generates a `.env` template.

**3. Configure `.env`**

```bash
nano /root/vidium/.env
```

Key variables:

| Variable | Description |
|---|---|
| `DOMAIN` | Your domain name |
| `INVITE_CODE` | Secret code for user registration (change from `changeme`) |
| `DEFAULT_LANG` | `en` or `ru` |
| `some_cli_tool_PROXY` | you know why |
| `some_cli_tool_COOKIES` | you know why |

**4. Get HTTPS**

Point your domain DNS A-record to the VPS IP, then:

```bash
certbot --nginx -d your-domain.com
```

**5. Start services**

```bash
systemctl enable --now vidium-server vidium-worker
systemctl status vidium-server vidium-worker
```

Open `http://your-domain.com` — you'll be redirected to `/login`. Register using the invite code from `.env`.

See `SETUP.md` for full usage guide (adding channels, bulk import, troubleshooting).

---

### Subsequent deploys

On the VPS:

```bash
cd /root/vidium
git pull
systemctl restart vidium-server vidium-worker
```

### Logs

```bash
ssh root@<VPS_IP> 'journalctl -u vidium-server -n 50 --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-worker -n 50 --no-pager'
```

---

## Development

**Prerequisites:** Node.js 24, [Biome](https://biomejs.dev) installed globally (`npm i -g @biomejs/biome`).

### Type checking

```bash
node --run check
```

### Linting

```bash
node --run lint       # check only
biome lint --write .  # check + autofix
```

### Formatting

```bash
node --run format
```