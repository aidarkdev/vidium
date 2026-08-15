for some specific reasons, one popular content hosting is not available in one country.
this project gives the way to get content from your own service.

for some specific reasons, one popular content hosting does not like, that some projects try to "crawl" and mirror contents of his own.
So maybe you will need make some movements to not be banned by this popular hosting: `.env` file (will be created after `setup.sh` gets called) already has some "config rows" that can be filled to avoid ban.

---

## Development

**Prerequisites:** Node.js 24 and development tools for type checking/linting.

The project is built as zero-dependency runtime software: no application-level
npm dependencies by default. Runtime code should rely on Node.js built-ins,
browser APIs, SQLite through Node, and nginx/systemd/OS tools. See
`docs/dependencies.md`.

AI coding agents must read and follow `AGENTS.md` plus the relevant docs in `docs/`
before making changes. Important entry points are `docs/frontend-parts.md`,
`docs/server-bakers.md`, `docs/server-runtime.md`, `docs/dependencies.md`, and
`docs/deploy.md`.

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
git clone https://github.com/aidarkdev/vidium /opt/vidium
cd /opt/vidium
bash setup.sh your-domain.com
nano /opt/vidium/.env
systemctl enable --now vidium-server vidium-worker
```

For HTTPS, point DNS to the VPS and run:

```bash
certbot --nginx -d your-domain.com
```

Open the site and register with `INVITE_CODE` from `.env`. New accounts start as `user`; grant the first admin role from the VPS:

```bash
cd /opt/vidium
./runtime/node/bin/node --env-file=.env -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.DB_PATH); db.prepare('UPDATE users SET role = ? WHERE login = ?').run('admin', 'YOUR_LOGIN');"
```

After one admin exists, manage roles from `/admin`. Continue with `SETUP.md` for usage details and `docs/deploy.md` for full deployment notes.

### Subsequent deploys

Git-based deploy on the VPS:

```bash
cd /opt/vidium
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
