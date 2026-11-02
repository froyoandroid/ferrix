#!/usr/bin/env bash
# Build the frontend, publish it to /var/www/ferrix, and restart the backend.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"

bun install --frozen-lockfile
bun run typecheck
bun run --filter @ferrix/frontend build

sudo mkdir -p /var/www/ferrix
sudo rsync -a --delete frontend/dist/ /var/www/ferrix/
sudo chown -R www-data:www-data /var/www/ferrix

sudo install -m 644 deploy/ferrix-backend.service /etc/systemd/system/ferrix-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now ferrix-backend
sudo systemctl restart ferrix-backend

sleep 1
curl -fsS http://127.0.0.1:8787/api/health && echo " backend ok"
