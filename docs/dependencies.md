# Dependency Policy

vidium should stay free of application-level npm dependencies.

## Runtime

The runtime dependency model is intentionally small:

- Node.js 24 provides the application runtime and built-in APIs. Production uses the pinned official Linux x64 release tarball installed by `scripts/setup/install-dependencies.sh` under `runtime/node`.
- Browser code uses native ES modules and DOM APIs.
- SQLite is accessed through the Node runtime API used by this project.
- `yt-dlp` is a pinned system binary installed outside npm by `scripts/setup/install-dependencies.sh`.
- nginx, certbot, and systemd are system-level runtime tools.
- `curl` is an optional runtime tool used only by the proxy-check service when a proxy check is configured.
- `git` is deployment-only tooling for the supported git-based deployment workflow; application services do not use it.

nginx, certbot, `python3-certbot-nginx`, curl, and git come from the Ubuntu repositories without exact version pins. Ubuntu remains responsible for their updates. Record the versions actually installed on a VPS with `bash scripts/runtime-inventory.sh`; use that saved inventory as input to a separate CVE review.

Do not add `dependencies` to `package.json` for application features unless there is a concrete reason that cannot be solved with Node/browser/system APIs already in use.

## Development

Development tools may exist outside the application runtime. Examples:

- TypeScript for `npm run check` / `node --run check`.
- Biome for formatting and linting.

These tools are allowed as development conveniences only. They must not become required by `src/server.ts`, `src/worker.ts`, browser parts, or production runtime behavior.

`dev-env-setup.sh` pins TypeScript and Biome and installs them without privileges under the current user's local directories. The currently pinned releases have no `preinstall`, `install`, or `postinstall` lifecycle scripts. Before every TypeScript or Biome version update, inspect the target release's npm package metadata and confirm those lifecycle fields remain absent; review and document any change before installing it.

## package.json

`package.json` is a development command manifest. It is not a runtime dependency manifest for the VPS service.

Current expected shape:

- scripts for check/lint/format are allowed.
- `dependencies` should be absent unless explicitly justified.
- runtime code must not import npm packages.

## Adding New Dependencies

Before adding any package, check these options in order:

1. Can Node.js 24 built-ins solve it?
2. Can existing project code solve it with a small extension?
3. Is it a system concern better handled by nginx, systemd, SQLite, or `yt-dlp`?
4. Is it only a development concern that can stay outside runtime?

If a dependency is still necessary, document:

- why built-ins are insufficient;
- where the dependency is used;
- whether it is runtime or development-only;
- how it affects VPS deployment.

Default answer for convenience libraries is no.

## yt-dlp Updates

Do not use yt-dlp self-update in production. Updates should be explicit: review the upstream release, update `YTDLP_VERSION` and `YTDLP_SHA256` in `scripts/setup/install-dependencies.sh`, deploy the helper, run it, and restart `vidium-worker`.

## Node.js Updates

Do not use remote shell installers for Node.js in production. Updates should be explicit: review the upstream release, update `NODE_VERSION` and `NODE_SHA256` in `scripts/setup/install-dependencies.sh`, deploy the helper, run it, and restart `vidium-server` and `vidium-worker`.

## Deployment

A minimal VPS deploy should copy application source and required runtime data/config only. Do not deploy `node_modules`; the service should not need it.

Keep persistent files such as `.env`, `data/`, `media/`, and cookies on the server. Application source can be updated independently.
