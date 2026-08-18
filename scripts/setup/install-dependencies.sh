#!/bin/bash
set -euo pipefail

# Ubuntu 24.04 x86_64. Run as root from the vidium project directory:
#   sudo bash scripts/setup/install-dependencies.sh

ARCH="$(uname -m)"
if [ "${ARCH}" != "x86_64" ]; then
  echo "ERROR: install-dependencies.sh supports only Ubuntu 24.04 x86_64; detected architecture: ${ARCH}." >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION_FILE="${APP_DIR}/scripts/setup/dependency-versions.sh"
if [ ! -f "${VERSION_FILE}" ]; then
  echo "ERROR: dependency version file is missing: ${VERSION_FILE}" >&2
  exit 1
fi
source "${VERSION_FILE}"

NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.gz"
NODE_DIR="${APP_DIR}/runtime/node-v${NODE_VERSION}-linux-x64"
NODE_LINK="${APP_DIR}/runtime/node"
NODE_LINK_TMP="${APP_DIR}/runtime/.node-link.$$"
NODE_BIN="${NODE_LINK}/bin/node"
NODE_TMP=
YTDLP_TMP=

cleanup() {
  if [ -n "${NODE_TMP}" ]; then
    rm -f "${NODE_TMP}"
  fi
  if [ -n "${YTDLP_TMP}" ]; then
    rm -f "${YTDLP_TMP}"
  fi
  rm -f "${NODE_LINK_TMP}"
}
trap cleanup EXIT

if [ "$#" -ne 0 ]; then
  echo "ERROR: install-dependencies.sh does not accept arguments." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: install-dependencies.sh must run as root." >&2
  exit 1
fi

case "${APP_DIR}" in
  /root|/root/*)
    echo "ERROR: do not run vidium from /root; install it under /opt/vidium." >&2
    exit 1
    ;;
esac

if [ ! -f "${APP_DIR}/package.json" ] || [ ! -d "${APP_DIR}/src" ]; then
  echo "ERROR: install-dependencies.sh must run from a complete vidium project tree." >&2
  exit 1
fi

APP_GID="$(stat -c '%g' "${APP_DIR}")"

echo "=== Updating package index ==="
apt update

echo "=== Installing base packages ==="
apt install -y curl

echo "=== Installing nginx ==="
apt install -y nginx

echo "=== Installing certbot ==="
apt install -y certbot python3-certbot-nginx

echo "=== Installing Node.js ${NODE_VERSION} ==="
mkdir -p "${APP_DIR}/runtime"
NODE_TMP="$(mktemp)"
curl -fsSL "https://nodejs.org/download/release/v${NODE_VERSION}/${NODE_TARBALL}" -o "${NODE_TMP}"
echo "${NODE_SHA256}  ${NODE_TMP}" | sha256sum -c -
tar -xzf "${NODE_TMP}" -C "${APP_DIR}/runtime"
rm -f "${NODE_TMP}"
NODE_TMP=
chown -R "root:${APP_GID}" "${NODE_DIR}"
ln -s "${NODE_DIR}" "${NODE_LINK_TMP}"
mv -Tf "${NODE_LINK_TMP}" "${NODE_LINK}"
chown -h "root:${APP_GID}" "${NODE_LINK}"
echo "Node.js version: $(${NODE_BIN} --version)"

echo "=== Installing yt-dlp ${YTDLP_VERSION} ==="
YTDLP_TMP="$(mktemp)"
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux" -o "${YTDLP_TMP}"
echo "${YTDLP_SHA256}  ${YTDLP_TMP}" | sha256sum -c -
install -o root -g root -m 0755 "${YTDLP_TMP}" /usr/local/bin/yt-dlp
rm -f "${YTDLP_TMP}"
YTDLP_TMP=
echo "yt-dlp version: $(yt-dlp --version)"
