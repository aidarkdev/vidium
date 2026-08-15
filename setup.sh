#!/bin/bash
set -euo pipefail

# ============================================
# vidium setup script
# Ubuntu 24.04, fresh install
# Run as root from project root: sudo bash setup.sh your-domain.com
# Or: DOMAIN=your-domain.com sudo -E bash setup.sh
# Source code is already in place alongside this script
# ============================================

DOMAIN="${DOMAIN:-${1:-}}"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
MEDIA_DIR="${APP_DIR}/media"
DATA_DIR="${APP_DIR}/data"
APP_USER=vidium
APP_GROUP=vidium
NODE_VERSION=24.19.0
NODE_SHA256=f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4
NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.gz"
NODE_DIR="${APP_DIR}/runtime/node-v${NODE_VERSION}-linux-x64"
NODE_LINK="${APP_DIR}/runtime/node"
NODE_BIN="${NODE_LINK}/bin/node"
NODE_TMP=
YTDLP_VERSION=2026.07.04
YTDLP_SHA256=495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd
YTDLP_TMP=

cleanup() {
  if [ -n "${NODE_TMP}" ]; then
    rm -f "${NODE_TMP}"
  fi
  if [ -n "${YTDLP_TMP}" ]; then
    rm -f "${YTDLP_TMP}"
  fi
}
trap cleanup EXIT

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: setup.sh must run as root."
  exit 1
fi

case "${APP_DIR}" in
  /root|/root/*)
    echo "ERROR: do not run vidium from /root; install it under /opt/vidium."
    exit 1
    ;;
esac

if [ -z "${DOMAIN}" ]; then
  read -rp "Domain for nginx/certbot (example: example.com): " DOMAIN
fi

if [ -z "${DOMAIN}" ] || [[ "${DOMAIN}" =~ [[:space:]/] ]]; then
  echo "ERROR: domain is required and must not contain spaces or slashes."
  echo "Usage: bash setup.sh your-domain.com"
  exit 1
fi

echo "=== Project directory: ${APP_DIR}; service account: ${APP_USER} ==="

if ! id "${APP_USER}" &>/dev/null; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "=== Updating system ==="
apt update && apt upgrade -y

echo "=== Installing base packages ==="
apt install -y curl wget git unzip

echo "=== Installing nginx ==="
apt install -y nginx
systemctl enable nginx
usermod -a -G "${APP_GROUP}" www-data

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
chown -R root:${APP_GROUP} "${NODE_DIR}"
ln -sfn "${NODE_DIR}" "${NODE_LINK}"
echo "Node.js version: $(${NODE_BIN} --version)"

echo "=== Installing yt-dlp ${YTDLP_VERSION} ==="
YTDLP_TMP="$(mktemp)"
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" -o "${YTDLP_TMP}"
echo "${YTDLP_SHA256}  ${YTDLP_TMP}" | sha256sum -c -
install -m 0755 "${YTDLP_TMP}" /usr/local/bin/yt-dlp
rm -f "${YTDLP_TMP}"
YTDLP_TMP=
echo "yt-dlp version: $(yt-dlp --version)"

echo "=== Creating runtime directories ==="
mkdir -p ${MEDIA_DIR}/{videos,audio,thumbs}
mkdir -p ${DATA_DIR}
mkdir -p "${APP_DIR}/deploy"
chown root:${APP_GROUP} "${APP_DIR}" "${APP_DIR}/package.json" "${APP_DIR}/setup.sh"
chown -R root:${APP_GROUP} "${APP_DIR}/src" "${APP_DIR}/scripts" "${APP_DIR}/runtime" "${APP_DIR}/deploy"
chmod 0750 "${APP_DIR}"
chmod -R g+rX,o-rwx "${APP_DIR}/src" "${APP_DIR}/scripts" "${APP_DIR}/runtime" "${APP_DIR}/deploy"
chown -R ${APP_USER}:${APP_GROUP} "${MEDIA_DIR}" "${DATA_DIR}"
find "${DATA_DIR}" -type d -exec chmod 0700 {} +
find "${DATA_DIR}" -type f -exec chmod 0600 {} +
find "${MEDIA_DIR}" -type d -exec chmod 2750 {} +
find "${MEDIA_DIR}" -type f -exec chmod 0640 {} +

echo "=== Setting up firewall ==="
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp || true
  ufw allow 'Nginx Full'
  ufw --force enable
else
  echo "ufw not found — skipping firewall setup"
fi

echo "=== Setting permissions for nginx ==="
# nginx reads deploy/media through membership in the vidium group.

echo "=== Creating nginx config ==="
cat > /etc/nginx/sites-available/${DOMAIN} << NGINX
limit_req_zone \$binary_remote_addr zone=download_requests:10m rate=5r/m;
limit_req_zone \$binary_remote_addr zone=play_requests:10m rate=10r/m;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} localhost;

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

ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "=== Creating systemd services ==="

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
cat > ${APP_DIR}/.env << EOF
# Server
PORT=3000
HOST=127.0.0.1
DOMAIN=${DOMAIN}

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
YTDLP_SLEEP=5
CRAWL_INITIAL=15

# Auth
INVITE_CODE=${INVITE_CODE}
SESSION_MAX_AGE=604800000

# i18n
DEFAULT_LANG=ru
EOF
echo ".env created — edit before starting services"
else
echo ".env already exists — skipping"
fi
chown ${APP_USER}:${APP_GROUP} "${APP_DIR}/.env"
chmod 0600 "${APP_DIR}/.env"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Point DNS: ${DOMAIN} -> $(curl -s ifconfig.me)"
echo "  2. Get HTTPS: certbot --nginx -d ${DOMAIN}"
echo "  3. Edit config: nano ${APP_DIR}/.env"
echo "  4. Start services:"
echo "     systemctl enable --now vidium-server"
echo "     systemctl enable --now vidium-worker"
echo "     systemctl enable --now vidium-proxy-check.timer"
echo ""
