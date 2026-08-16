#!/bin/bash
set -euo pipefail

# Ubuntu 24.04 x86_64. Run as root from the vidium project directory:
#   sudo bash scripts/setup/apply-host-config.sh [--configure-firewall=<ssh-port>] [--force-nginx] <domain>

usage() {
  echo "Usage: bash scripts/setup/apply-host-config.sh [--configure-firewall=<ssh-port>] [--force-nginx] <domain>" >&2
}

validate_firewall_port() {
  local port="$1"

  if [[ ! "${port}" =~ ^[0-9]+$ ]] || [ "${#port}" -gt 5 ] ||
    ((10#${port} < 1 || 10#${port} > 65535)); then
    echo "ERROR: firewall SSH port must be an integer from 1 to 65535." >&2
    exit 1
  fi
}

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MEDIA_DIR="${APP_DIR}/media"
DATA_DIR="${APP_DIR}/data"
APP_USER=vidium
APP_GROUP=vidium
NODE_BIN="${APP_DIR}/runtime/node/bin/node"
FIREWALL_PORT=
FORCE_NGINX=false
POSITIONAL_DOMAIN=
NGINX_TMP=
ENABLED_TMP=

cleanup() {
  if [ -n "${NGINX_TMP}" ]; then
    rm -f "${NGINX_TMP}"
  fi
  if [ -n "${ENABLED_TMP}" ]; then
    rm -f "${ENABLED_TMP}"
  fi
}
trap cleanup EXIT

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
  echo "ERROR: apply-host-config.sh must run as root." >&2
  exit 1
fi

case "${APP_DIR}" in
  /root|/root/*)
    echo "ERROR: do not run vidium from /root; install it under /opt/vidium." >&2
    exit 1
    ;;
esac

if [ ! -f "${APP_DIR}/package.json" ] || [ ! -d "${APP_DIR}/src" ]; then
  echo "ERROR: apply-host-config.sh must run from a complete vidium project tree." >&2
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

SITE_FILE="/etc/nginx/sites-available/${DOMAIN_VALUE}"
ENABLED_LINK="/etc/nginx/sites-enabled/${DOMAIN_VALUE}"

if [ ! -x "${NODE_BIN}" ]; then
  echo "ERROR: Node.js is missing at ${NODE_BIN}; run scripts/setup/install-dependencies.sh first." >&2
  exit 1
fi
if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "ERROR: yt-dlp is missing; run scripts/setup/install-dependencies.sh first." >&2
  exit 1
fi
if ! command -v nginx >/dev/null 2>&1; then
  echo "ERROR: nginx is missing; run scripts/setup/install-dependencies.sh first." >&2
  exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemd is missing." >&2
  exit 1
fi
if [ -n "${FIREWALL_PORT}" ] && ! command -v ufw >/dev/null 2>&1; then
  echo "ERROR: --configure-firewall was requested, but UFW is not installed." >&2
  exit 1
fi
if [ -d "${SITE_FILE}" ] && [ ! -L "${SITE_FILE}" ]; then
  echo "ERROR: ${SITE_FILE} is a directory and cannot be used as an nginx site file." >&2
  exit 1
fi
if [ -d "${ENABLED_LINK}" ] && [ ! -L "${ENABLED_LINK}" ]; then
  echo "ERROR: ${ENABLED_LINK} is a directory and cannot be used as an nginx enabled-site link." >&2
  exit 1
fi
if { [ -e "${SITE_FILE}" ] || [ -L "${SITE_FILE}" ]; } && [ "${FORCE_NGINX}" != true ]; then
  echo "ERROR: ${SITE_FILE} already exists; use --force-nginx to replace it." >&2
  exit 1
fi
if { [ -e "${ENABLED_LINK}" ] || [ -L "${ENABLED_LINK}" ]; } && [ "${FORCE_NGINX}" != true ]; then
  echo "ERROR: ${ENABLED_LINK} already exists; use --force-nginx to replace it." >&2
  exit 1
fi

NGINX_TMP="$(mktemp)"
cat > "${NGINX_TMP}" << NGINX
limit_req_zone \$binary_remote_addr zone=download_requests:10m rate=5r/m;
limit_req_zone \$binary_remote_addr zone=play_requests:10m rate=10r/m;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_VALUE} localhost;

    location = /api/download {
        limit_req zone=download_requests burst=4 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /api/play {
        limit_req zone=play_requests burst=9 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Hashed browser assets prepared by scripts/prepare-static.ts
    location /static/ {
        alias ${APP_DIR}/deploy/static/;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }

    location /engine/ {
        alias ${APP_DIR}/deploy/engine/;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }

    location /parts/ {
        alias ${APP_DIR}/deploy/parts/;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }

    # Protected media — only via X-Accel-Redirect from Node
    location /protected_media/ {
        internal;
        alias ${APP_DIR}/media/;
    }
}
NGINX

echo "=== Project directory: ${APP_DIR}; service account: ${APP_USER} ==="

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "${APP_USER}"
fi
usermod -a -G "${APP_GROUP}" www-data

echo "=== Creating runtime directories ==="
mkdir -p "${MEDIA_DIR}/videos" "${MEDIA_DIR}/audio" "${MEDIA_DIR}/thumbs"
mkdir -p "${DATA_DIR}"
mkdir -p "${APP_DIR}/deploy"
chown "root:${APP_GROUP}" "${APP_DIR}" "${APP_DIR}/package.json" "${APP_DIR}/setup.sh"
chown -R "root:${APP_GROUP}" "${APP_DIR}/src" "${APP_DIR}/scripts" "${APP_DIR}/runtime" "${APP_DIR}/deploy"
chmod 0750 "${APP_DIR}"
chmod -R g+rX,o-rwx "${APP_DIR}/src" "${APP_DIR}/scripts" "${APP_DIR}/runtime" "${APP_DIR}/deploy"
chown -R "${APP_USER}:${APP_GROUP}" "${MEDIA_DIR}" "${DATA_DIR}"
find "${DATA_DIR}" -type d -exec chmod 0700 {} +
find "${DATA_DIR}" -type f -exec chmod 0600 {} +
find "${MEDIA_DIR}" -type d -exec chmod 2750 {} +
find "${MEDIA_DIR}" -type f -exec chmod 0640 {} +

echo "=== Installing nginx config ==="
STAMP="$(date -u +%Y%m%dT%H%M%SZ).$$"
SITE_BACKUP="${SITE_FILE}.backup.${STAMP}"
ENABLED_BACKUP="${SITE_FILE}.enabled-backup.${STAMP}"
SITE_EXISTED=false
ENABLED_EXISTED=false

if [ -e "${SITE_FILE}" ] || [ -L "${SITE_FILE}" ]; then
  SITE_EXISTED=true
  cp -a "${SITE_FILE}" "${SITE_BACKUP}"
  echo "Saved nginx site backup: ${SITE_BACKUP}"
fi
if [ -e "${ENABLED_LINK}" ] || [ -L "${ENABLED_LINK}" ]; then
  ENABLED_EXISTED=true
  cp -a "${ENABLED_LINK}" "${ENABLED_BACKUP}"
  echo "Saved nginx enabled-state backup: ${ENABLED_BACKUP}"
elif [ "${FORCE_NGINX}" = true ] && [ "${SITE_EXISTED}" = true ]; then
  : > "${ENABLED_BACKUP}.absent"
  echo "Saved nginx enabled-state marker: ${ENABLED_BACKUP}.absent"
fi

restore_nginx_config() {
  rm -f "${SITE_FILE}" "${ENABLED_LINK}"
  if [ "${SITE_EXISTED}" = true ]; then
    cp -a "${SITE_BACKUP}" "${SITE_FILE}"
  fi
  if [ "${ENABLED_EXISTED}" = true ]; then
    cp -a "${ENABLED_BACKUP}" "${ENABLED_LINK}"
  fi
}

if ! install -o root -g root -m 0644 "${NGINX_TMP}" "${SITE_FILE}"; then
  restore_nginx_config
  echo "ERROR: failed to install the nginx site; the previous state was restored." >&2
  exit 1
fi
ENABLED_TMP="/etc/nginx/sites-enabled/.${DOMAIN_VALUE}.$$"
if ! ln -s "${SITE_FILE}" "${ENABLED_TMP}"; then
  restore_nginx_config
  echo "ERROR: failed to create the nginx enabled-site link; the previous state was restored." >&2
  exit 1
fi
if ! mv -Tf "${ENABLED_TMP}" "${ENABLED_LINK}"; then
  restore_nginx_config
  echo "ERROR: failed to enable the nginx site; the previous state was restored." >&2
  exit 1
fi
ENABLED_TMP=

if ! nginx -t; then
  restore_nginx_config
  echo "ERROR: nginx configuration test failed; the previous site file and enabled state were restored." >&2
  exit 1
fi

rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
else
  systemctl restart nginx
fi

echo "=== Creating systemd units ==="
cat > /etc/systemd/system/vidium-server.service << EOF
[Unit]
Description=vidium - server
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} --env-file=${APP_DIR}/.env src/server.ts
UMask=0077
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/vidium-worker.service << EOF
[Unit]
Description=vidium - worker
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} --env-file=${APP_DIR}/.env src/worker.ts
UMask=0027
Restart=always
RestartSec=5
KillMode=mixed
TimeoutStopSec=30min

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/vidium-proxy-check.service << EOF
[Unit]
Description=vidium - proxy status check
After=network.target

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} --env-file=${APP_DIR}/.env scripts/check-proxy-status.ts
UMask=0077
EOF

cat > /etc/systemd/system/vidium-proxy-check.timer << EOF
[Unit]
Description=vidium - proxy status check timer

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
Unit=vidium-proxy-check.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload

echo "=== Creating .env template ==="
if [ ! -f "${APP_DIR}/.env" ]; then
  INVITE_CODE="$("${NODE_BIN}" -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))")"
  cat > "${APP_DIR}/.env" << EOF
# Server
PORT=3000
HOST=127.0.0.1

# Database
DB_PATH=${DATA_DIR}/vidium.db

# Media
MEDIA_DIR=${MEDIA_DIR}
DISK_HIGH_WATERMARK=0.80
DISK_LOW_WATERMARK=0.60

# yt-dlp
YTDLP_PROXY=
PROXY_STATUS_PATH=${DATA_DIR}/proxy-status.json
YTDLP_COOKIES=
CRAWL_INITIAL=15

# Auth
INVITE_CODE=${INVITE_CODE}
SESSION_MAX_AGE=604800000

# i18n
DEFAULT_LANG=ru
EOF
  echo ".env created — edit before starting services"
else
  echo ".env already exists — preserving contents"
fi
chown "${APP_USER}:${APP_GROUP}" "${APP_DIR}/.env"
chmod 0600 "${APP_DIR}/.env"

if [ -n "${FIREWALL_PORT}" ]; then
  echo "=== Configuring firewall ==="
  ufw allow "${FIREWALL_PORT}/tcp"
  ufw allow 'Nginx Full'
  ufw --force enable
fi

echo ""
echo "=== Host configuration complete ==="
echo ""
echo "Next steps:"
echo "  1. Point ${DOMAIN_VALUE} DNS records to this server's public IP address."
echo "  2. Get HTTPS: certbot --nginx -d ${DOMAIN_VALUE}"
echo "  3. Edit config: nano ${APP_DIR}/.env"
echo "  4. Start services:"
echo "     systemctl enable --now vidium-server"
echo "     systemctl enable --now vidium-worker"
echo "     systemctl enable --now vidium-proxy-check.timer"
echo ""
