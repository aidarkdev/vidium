#!/bin/bash
set -euo pipefail

# ============================================
# vidium setup orchestrator
# Ubuntu 24.04 x86_64, fresh install
# Run as root from project root:
#   sudo bash setup.sh [--configure-firewall=<ssh-port>] [--force-nginx] your-domain.com
# Or:
#   DOMAIN=your-domain.com sudo -E bash setup.sh
# ============================================

usage() {
  echo "Usage: bash setup.sh [--configure-firewall=<ssh-port>] [--force-nginx] <domain>" >&2
}

validate_firewall_port() {
  local port="$1"

  if [[ ! "${port}" =~ ^[0-9]+$ ]] || [ "${#port}" -gt 5 ] ||
    ((10#${port} < 1 || 10#${port} > 65535)); then
    echo "ERROR: firewall SSH port must be an integer from 1 to 65535." >&2
    exit 1
  fi
}

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SCRIPT="${APP_DIR}/scripts/setup/install-dependencies.sh"
CONFIG_SCRIPT="${APP_DIR}/scripts/setup/apply-host-config.sh"
FIREWALL_PORT=
FORCE_NGINX=false
POSITIONAL_DOMAIN=

for arg in "$@"; do
  case "${arg}" in
    --configure-firewall=*)
      if [ -n "${FIREWALL_PORT}" ]; then
        echo "ERROR: --configure-firewall may be specified only once." >&2
        usage
        exit 1
      fi
      FIREWALL_PORT="${arg#*=}"
      validate_firewall_port "${FIREWALL_PORT}"
      ;;
    --force-nginx)
      if [ "${FORCE_NGINX}" = true ]; then
        echo "ERROR: --force-nginx may be specified only once." >&2
        usage
        exit 1
      fi
      FORCE_NGINX=true
      ;;
    --*)
      echo "ERROR: unknown option: ${arg}" >&2
      usage
      exit 1
      ;;
    *)
      if [ -n "${POSITIONAL_DOMAIN}" ]; then
        echo "ERROR: multiple domains were provided." >&2
        usage
        exit 1
      fi
      POSITIONAL_DOMAIN="${arg}"
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: setup.sh must run as root." >&2
  exit 1
fi

case "${APP_DIR}" in
  /root|/root/*)
    echo "ERROR: do not run vidium from /root; install it under /opt/vidium." >&2
    exit 1
    ;;
esac

if [ ! -f "${APP_DIR}/package.json" ] || [ ! -d "${APP_DIR}/src" ]; then
  echo "ERROR: setup.sh must run from a complete vidium project tree." >&2
  exit 1
fi

if [ ! -f "${INSTALL_SCRIPT}" ] || [ ! -f "${CONFIG_SCRIPT}" ]; then
  echo "ERROR: setup helper scripts are missing; deploy scripts/setup/ before running setup.sh." >&2
  exit 1
fi

DOMAIN_VALUE="${POSITIONAL_DOMAIN:-${DOMAIN:-}}"
if [ -z "${DOMAIN_VALUE}" ]; then
  read -rp "Domain for nginx/certbot (example: example.com): " DOMAIN_VALUE
fi

if [ -z "${DOMAIN_VALUE}" ] || [[ "${DOMAIN_VALUE}" =~ [[:space:]/] ]]; then
  echo "ERROR: domain is required and must not contain spaces or slashes." >&2
  usage
  exit 1
fi

CONFIG_ARGS=()
if [ -n "${FIREWALL_PORT}" ]; then
  CONFIG_ARGS+=("--configure-firewall=${FIREWALL_PORT}")
fi
if [ "${FORCE_NGINX}" = true ]; then
  CONFIG_ARGS+=("--force-nginx")
fi
CONFIG_ARGS+=("${DOMAIN_VALUE}")

bash "${INSTALL_SCRIPT}"
bash "${CONFIG_SCRIPT}" "${CONFIG_ARGS[@]}"
