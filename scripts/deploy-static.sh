#!/usr/bin/env bash
set -euo pipefail

VPS="${1:?usage: deploy-static.sh root@host [app-dir]}"
APP_DIR="${2:-/opt/vidium}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node "${ROOT}/scripts/prepare-static.ts"
rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
  "${ROOT}/tmp/vidium-static/" "${VPS}:${APP_DIR}/deploy/"
ssh "${VPS}" 'systemctl restart vidium-server vidium-worker'
