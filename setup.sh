#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/codeforge"
NODE_VERSION="20"

echo "=== CodeForge VPS Setup ==="

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo."
  exit 1
fi

echo "[1/5] Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl gnupg ca-certificates \
  python3 gcc g++ php-cli default-jdk nasm \
  --no-install-recommends
ln -sf /usr/bin/python3 /usr/bin/python

echo "[2/5] Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y -qq nodejs

echo "[3/5] Creating app user..."
id -u codeforge &>/dev/null || useradd -m -s /bin/bash codeforge

echo "[4/5] Setting up application..."
mkdir -p "$APP_DIR"
cp -r frontend/.next/standalone/* "$APP_DIR/"
cp -r frontend/.next/static "$APP_DIR/.next/static"
cp -r frontend/public "$APP_DIR/public"
chown -R codeforge:codeforge "$APP_DIR"

echo "[5/5] Installing production dependencies..."
cd "$APP_DIR"
npm install --production

echo ""
echo "=== Setup complete ==="
echo "Run the app with:"
echo "  cd $APP_DIR && PORT=3000 node server.js"
echo ""
echo "Recommended: use a process manager:"
echo "  npm install -g pm2"
echo "  pm2 start $APP_DIR/server.js --name codeforge"
