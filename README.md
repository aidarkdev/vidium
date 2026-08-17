for some specific reasons, one popular content hosting is not available in one country.
this project gives the way to get content from your own service.

for some specific reasons, one popular content hosting does not like, that some projects try to "crawl" and mirror contents of his own.
You may need a proxy or cookies to avoid upstream request blocking. On the first bootstrap, `setup.sh` creates an `.env` template with the relevant yt-dlp settings; the host configurator never overwrites an existing file.

---

## Development

**Prerequisites:** Ubuntu 24.04 x86_64 and a system Chromium-compatible browser.
Install the pinned Node.js and development tools as a regular user:

```bash
bash dev-env-setup.sh
```

Add `~/.local/bin` to `PATH` if it is not already available in your shell.

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
node --run format:check  # check only
node --run format        # rewrite files
```

### Tests

```bash
node --run test
node --run test:browser
node --run test:coverage:server
```

The Chromium tests use the system browser. Set `VIDIUM_CHROMIUM_PATH` when it is
not installed at a common Chromium/Chrome path.

`test:coverage:server` covers the TypeScript server/runtime surface and enforces
minimum line, branch, and function coverage. Browser behavior is enforced by the
separate Chromium suite and is not included in the server coverage percentage.

GitHub Actions runs type checking, linting, formatting checks, server coverage,
and browser tests for pull requests targeting `master` and pushes to `master`.
`master` is the current primary CI/CD branch, and the `quality` job is intended
to be configured as a required status check for it.

---

## Deploying to a VPS

The supported bootstrap platform is Ubuntu 24.04 x86_64. Deployment is performed from a clean local checkout with rsync; the VPS does not need Git. Full deployment documentation lives in `docs/deploy.md`.

### First deploy

Copy the bootstrap files from the local checkout:

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
  ./ root@<VPS_IP>:/opt/vidium/
```

Bootstrap the VPS:

```bash
ssh root@<VPS_IP>
cd /opt/vidium
bash setup.sh your-domain.com
nano /opt/vidium/.env
exit
```

Deploy the complete checked revision from the local checkout, then enable the services:

```bash
scripts/deploy.sh root@<VPS_IP>
ssh root@<VPS_IP> 'systemctl enable --now vidium-server vidium-worker vidium-proxy-check.timer'
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

Run from a clean local checkout at the current `origin/master`. The deployment
scripts intentionally deploy only the current `master` revision: they verify
that `HEAD` matches `origin/master` and that the required GitHub Actions
`quality` check succeeded for that commit. They then build the hashed browser
assets, rsync server code and assets, restart the services, perform an HTTP
smoke check, and record the deployed commit in
`/opt/vidium/.deployed-revision`.

```bash
scripts/deploy.sh root@<VPS_IP>
```

For first-machine setup, exact file lists, nginx reload rules, and runtime file policy, see `docs/deploy.md`.

### Logs

```bash
ssh root@<VPS_IP> 'journalctl -u vidium-server -n 50 --no-pager'
ssh root@<VPS_IP> 'journalctl -u vidium-worker -n 50 --no-pager'
```

---
