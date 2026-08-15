#!/usr/bin/env bash
set -euo pipefail

VPS="${1:?usage: deploy.sh root@host [app-dir]}"
APP_DIR="${2:-/opt/vidium}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Syncing server code ==="
rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
  --include='/src/***' \
  --include='/scripts/' \
  --include='/scripts/check-proxy-status.ts' \
  --include='/package.json' \
  --exclude='*' \
  "${ROOT}/" \
  "${VPS}:${APP_DIR}/"

echo "=== Preparing and syncing static assets ==="
node "${ROOT}/scripts/prepare-static.ts"
rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
  "${ROOT}/tmp/vidium-static/" "${VPS}:${APP_DIR}/deploy/"

echo "=== Restarting services ==="
ssh "${VPS}" 'systemctl restart vidium-server vidium-worker'

echo "Done."
