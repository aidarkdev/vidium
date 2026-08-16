#!/bin/bash
set -euo pipefail

# ============================================
# vidium dev environment setup
# Ubuntu 24.04 x86_64
# Run as regular user: bash dev-env-setup.sh
# ============================================

ARCH="$(uname -m)"
if [ "${ARCH}" != "x86_64" ]; then
  echo "ERROR: dev-env-setup.sh supports only Ubuntu 24.04 x86_64; detected architecture: ${ARCH}." >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION_FILE="${PROJECT_DIR}/scripts/setup/dependency-versions.sh"
if [ ! -f "${VERSION_FILE}" ]; then
  echo "ERROR: dependency version file is missing: ${VERSION_FILE}" >&2
  exit 1
fi
source "${VERSION_FILE}"

NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.gz"
NODE_BASE="${HOME}/.local/share/vidium-node"
NODE_DIR="${NODE_BASE}/node-v${NODE_VERSION}-linux-x64"
NODE_LINK="${NODE_BASE}/node"
NODE_BIN="${NODE_LINK}/bin/node"
NPM_BIN="${NODE_LINK}/bin/npm"
NPM_PREFIX="${HOME}/.local/share/vidium-npm"
USER_BIN="${HOME}/.local/bin"
NODE_TMP=

cleanup() {
  if [ -n "${NODE_TMP}" ]; then
    rm -f "${NODE_TMP}"
  fi
}
trap cleanup EXIT

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: dev-env-setup.sh must run as a regular user, not root."
  exit 1
fi

echo "=== Installing Node.js ${NODE_VERSION} ==="
mkdir -p "${NODE_BASE}" "${USER_BIN}"
NODE_TMP="$(mktemp)"
curl -fsSL "https://nodejs.org/download/release/v${NODE_VERSION}/${NODE_TARBALL}" -o "${NODE_TMP}"
echo "${NODE_SHA256}  ${NODE_TMP}" | sha256sum -c -
tar -xzf "${NODE_TMP}" -C "${NODE_BASE}"
rm -f "${NODE_TMP}"
NODE_TMP=
ln -sfn "${NODE_DIR}" "${NODE_LINK}"
ln -sfn "${NODE_LINK}/bin/node" "${USER_BIN}/node"
ln -sfn "${NODE_LINK}/bin/npm" "${USER_BIN}/npm"
ln -sfn "${NODE_LINK}/bin/npx" "${USER_BIN}/npx"
echo "Node.js: $(${NODE_BIN} --version)"
echo "npm:     $(${NPM_BIN} --version)"

echo "=== Installing TypeScript and Biome (global) ==="
"${NPM_BIN}" install --global --prefix "${NPM_PREFIX}" "typescript@${TYPESCRIPT_VERSION}" "@biomejs/biome@${BIOME_VERSION}"
ln -sfn "${NPM_PREFIX}/bin/tsc" "${USER_BIN}/tsc"
ln -sfn "${NPM_PREFIX}/bin/biome" "${USER_BIN}/biome"
echo "tsc:   $("${USER_BIN}/tsc" --version)"
echo "biome: $("${USER_BIN}/biome" --version)"

echo ""
echo "=== Done ==="
echo "  Add ${USER_BIN} to PATH if it is not already there."
echo "  node --run check   — type check"
echo "  node --run format  — format"
echo "  node --run lint    — lint"
