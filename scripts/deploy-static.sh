#!/usr/bin/env bash
set -euo pipefail

VPS="${1:?usage: deploy-static.sh root@host [app-dir]}"
APP_DIR="${2:-/opt/vidium}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

VIDIUM_DEPLOY_STATIC_ONLY=true bash "${ROOT}/scripts/deploy.sh" "${VPS}" "${APP_DIR}"
