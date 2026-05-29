#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/enterprise-intel-prod}"
cd "$APP_DIR"

git pull --ff-only origin main
npm ci --include=dev
npm run build
systemctl restart zxb-intel.service zxb-intel-worker.service
systemctl reload nginx

systemctl is-active --quiet zxb-intel.service
systemctl is-active --quiet zxb-intel-worker.service
curl -fsS https://zxbapi.aiyes.vip/health >/dev/null
