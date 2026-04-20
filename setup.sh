#!/bin/bash
set -euo pipefail

# ============================================
# vidium setup script
# Ubuntu 24.04, fresh install
# Run as root from project root: sudo bash setup.sh
# Source code is already in place alongside this script
# ============================================

DOMAIN="vidium.pupupu.work"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
MEDIA_DIR="${APP_DIR}/media"
DATA_DIR="${APP_DIR}/data"
NODE_MAJOR=24

# Detect the user who owns the project directory; fall back to root
APP_USER="$(stat -c '%U' "${APP_DIR}")"
APP_GROUP="$(stat -c '%G' "${APP_DIR}")"
if [ "${APP_USER}" = "UNKNOWN" ] || [ -z "${APP_USER}" ]; then
  APP_USER="root"
  APP_GROUP="root"
fi

echo "=== Project directory: ${APP_DIR} (owner: ${APP_USER}) ==="

echo "=== Updating system ==="
apt update && apt upgrade -y

echo "=== Installing base packages ==="
apt install -y curl wget git unzip

echo "=== Installing nginx ==="
apt install -y nginx
systemctl enable nginx

echo "=== Installing certbot ==="
apt install -y certbot python3-certbot-nginx

echo "=== Installing Node.js ${NODE_MAJOR} ==="
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
apt install -y nodejs
echo "Node.js version: $(node --version)"

echo "=== Installing yt-dlp ==="
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
echo "yt-dlp version: $(yt-dlp --version)"

echo "=== Creating runtime directories ==="
mkdir -p ${MEDIA_DIR}/{videos,audio,thumbs}
mkdir -p ${DATA_DIR}
chown -R ${APP_USER}:${APP_GROUP} ${MEDIA_DIR} ${DATA_DIR}

echo "=== Setting up firewall ==="
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp || true
  ufw allow 'Nginx Full'
  ufw --force enable
else
  echo "ufw not found — skipping firewall setup"
fi

echo "=== Creating yt-dlp update cron ==="
cat > /etc/cron.d/ytdlp-update << 'EOF'
0 */6 * * * root /usr/local/bin/yt-dlp -U > /dev/null 2>&1
EOF

echo "=== Setting permissions for nginx ==="
# nginx (www-data) needs execute on each parent dir to reach static/media files
chmod o+x $(dirname "${APP_DIR}") "${APP_DIR}" "${APP_DIR}/src" "${APP_DIR}/src/static"
# Symlink so nginx alias /static/ works without knowing about src/
ln -sfn "${APP_DIR}/src/static" "${APP_DIR}/static"

echo "=== Creating nginx config ==="
cat > /etc/nginx/sites-available/${DOMAIN} << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} localhost;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static files — nginx serves directly (CSS, JS, fonts)
    location /static/ {
        alias ${APP_DIR}/static/;
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
nginx -t && systemctl reload nginx

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
ExecStart=/usr/bin/node --env-file=${APP_DIR}/.env src/server.ts
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
ExecStart=/usr/bin/node --env-file=${APP_DIR}/.env src/worker.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "=== Creating .env template ==="
if [ ! -f ${APP_DIR}/.env ]; then
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
YTDLP_COOKIES=
YTDLP_SLEEP=5
CRAWL_INITIAL=15

# Auth
INVITE_CODE=changeme
SESSION_MAX_AGE=604800000

# i18n
DEFAULT_LANG=ru
EOF
chown ${APP_USER}:${APP_GROUP} ${APP_DIR}/.env
echo ".env created — edit before starting services"
else
echo ".env already exists — skipping"
fi

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
echo ""
