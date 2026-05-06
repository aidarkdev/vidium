for some specific reasons, one popular content hosting is not available in one country.
this project gives the way to get content from your own service.

for some specific reasons, one popular content hosting does not like, that some projects try to "crawl" and mirror contents of his own.
So maybe you will need make some movements to not be banned by this popular hosting: `.env` file (will be created after `setup.sh` gets called) already has some "config rows" that can be filled to avoid ban.

---

## Deploying to a VPS

Tested on Ubuntu 24.04. Full deployment documentation lives in `docs/deploy.md`.

Two deployment styles are supported:

- Git-based deployment on the VPS.
- rsync deployment from a local checkout.

### Quick Git Deploy

Run as root on the VPS:

```bash
ssh root@<VPS_IP>
git clone https://github.com/aidarkdev/vidium /root/vidium
cd /root/vidium
bash setup.sh
nano /root/vidium/.env
systemctl enable --now vidium-server vidium-worker
```

For HTTPS, point DNS to the VPS and run:

```bash
certbot --nginx -d your-domain.com
```

Open the site, register with `INVITE_CODE` from `.env`, and continue with `SETUP.md` for usage details.

### Subsequent deploys

Git-based deploy on the VPS:

```bash
cd /root/vidium
git pull
systemctl restart vidium-server vidium-worker
```

For rsync deploys, first-machine setup, exact file lists, nginx reload rules, and runtime file policy, see `docs/deploy.md`.

### Logs

```bash
ssh root@<VPS_IP> 'journalctl -u vidium-server -n 50 --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-worker -n 50 --no-pager'
```

---

## Development

**Prerequisites:** Node.js 24 and development tools for type checking/linting.

Runtime code should stay free of application-level npm dependencies. See `docs/dependencies.md`.

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
