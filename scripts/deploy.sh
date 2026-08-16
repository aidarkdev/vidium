#!/usr/bin/env bash
set -euo pipefail

VPS="${1:?usage: deploy.sh root@host [app-dir]}"
APP_DIR="${2:-/opt/vidium}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GITHUB_REPOSITORY="${VIDIUM_GITHUB_REPOSITORY:-aidarkdev/vidium}"
STATIC_ONLY="${VIDIUM_DEPLOY_STATIC_ONLY:-false}"

case "${APP_DIR}" in
  /*) ;;
  *)
    echo "ERROR: app-dir must be an absolute path." >&2
    exit 1
    ;;
esac
if [[ ! "${APP_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "ERROR: app-dir contains unsupported characters." >&2
  exit 1
fi

if [ -n "$(git -C "${ROOT}" status --porcelain --untracked-files=normal)" ]; then
  echo "ERROR: deployment requires a clean checkout, including no untracked files." >&2
  exit 1
fi

REVISION="$(git -C "${ROOT}" rev-parse HEAD)"
git -C "${ROOT}" fetch --quiet origin master
REMOTE_REVISION="$(git -C "${ROOT}" rev-parse origin/master)"
if [ "${REVISION}" != "${REMOTE_REVISION}" ]; then
  echo "ERROR: HEAD ${REVISION} is not the current origin/master ${REMOTE_REVISION}." >&2
  exit 1
fi

echo "=== Verifying required CI check for ${REVISION} ==="
VIDIUM_DEPLOY_SHA="${REVISION}" VIDIUM_GITHUB_REPOSITORY="${GITHUB_REPOSITORY}" node --input-type=module -e '
  const repository = process.env.VIDIUM_GITHUB_REPOSITORY;
  const sha = process.env.VIDIUM_DEPLOY_SHA;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vidium-deploy",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${sha}/check-runs`, {
    headers,
  });
  if (!response.ok) {
    console.error(`ERROR: GitHub check lookup failed: HTTP ${response.status}.`);
    process.exit(1);
  }
  const result = await response.json();
  const quality = result.check_runs?.find(
    (check) => check.name === "quality" && check.app?.slug === "github-actions",
  );
  if (quality?.status !== "completed" || quality?.conclusion !== "success") {
    console.error("ERROR: required GitHub Actions check quality is not successful for this commit.");
    process.exit(1);
  }
'

echo "=== Preparing static assets ==="
node "${ROOT}/scripts/prepare-static.ts"

if [ "${STATIC_ONLY}" != "true" ]; then
  echo "=== Syncing server code ==="
  rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
    --include='/src/***' \
    --include='/setup.sh' \
    --include='/scripts/' \
    --include='/scripts/setup/***' \
    --include='/scripts/check-proxy-status.ts' \
    --include='/scripts/runtime-inventory.sh' \
    --include='/package.json' \
    --exclude='*' \
    "${ROOT}/" \
    "${VPS}:${APP_DIR}/"
fi

echo "=== Syncing static assets ==="
rsync -av --delete --chown=root:vidium --chmod=D750,F640 \
  "${ROOT}/tmp/vidium-static/" "${VPS}:${APP_DIR}/deploy/"

echo "=== Restarting and checking services ==="
ssh "${VPS}" bash -s -- "${APP_DIR}" "${REVISION}" <<'REMOTE'
set -euo pipefail

APP_DIR="$1"
REVISION="$2"

systemctl restart vidium-server vidium-worker
systemctl is-active --quiet vidium-server vidium-worker

healthy=false
for _ in {1..10}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
if [ "${healthy}" != "true" ]; then
  echo "ERROR: vidium HTTP smoke check failed after restart." >&2
  exit 1
fi

printf '%s\n' "${REVISION}" > "${APP_DIR}/.deployed-revision"
chown root:vidium "${APP_DIR}/.deployed-revision"
chmod 0640 "${APP_DIR}/.deployed-revision"
REMOTE

echo "Deployed ${REVISION}."
