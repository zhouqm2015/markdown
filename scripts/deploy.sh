#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DIST="${ROOT}/mdEditor/dist"
REMOTE_PATH="${REMOTE_PATH:-/usr/share/nginx/html/mdEditor}"
SERVER="${SERVER:-}"

echo "Building production bundle..."
npm run build

if [[ -n "${SERVER}" ]]; then
  echo "Deploying mdEditor/dist/ -> ${SERVER}:${REMOTE_PATH}/"
  rsync -avz --delete "${DIST}/" "${SERVER}:/tmp/mdEditor-deploy/"
  ssh "${SERVER}" "sudo mkdir -p '${REMOTE_PATH}' && sudo rsync -av --delete /tmp/mdEditor-deploy/ '${REMOTE_PATH}/' && sudo chmod -R a+rX '${REMOTE_PATH}' && rm -rf /tmp/mdEditor-deploy"
  echo "Done. Visit: http://<your-host>/mdEditor/"
elif [[ -d "$(dirname "${REMOTE_PATH}")" ]]; then
  echo "Deploying mdEditor/dist/ -> ${REMOTE_PATH}/"
  sudo mkdir -p "${REMOTE_PATH}"
  sudo rsync -av --delete "${DIST}/" "${REMOTE_PATH}/"
  echo "Done. Visit: http://<host>/mdEditor/"
else
  ARCHIVE="${ROOT}/mdEditor-deploy.tar.gz"
  tar -czf "${ARCHIVE}" -C "${DIST}" .
  echo ""
  echo "本地无 nginx 目录，已打包: ${ARCHIVE}"
  echo ""
  echo "上传到服务器后解压："
  echo "  scp mdEditor-deploy.tar.gz user@server:/tmp/"
  echo "  ssh user@server 'sudo mkdir -p ${REMOTE_PATH} && sudo tar -xzf /tmp/mdEditor-deploy.tar.gz -C ${REMOTE_PATH} && sudo chmod -R a+rX ${REMOTE_PATH}'"
  echo ""
  echo "或使用 rsync 一键部署："
  echo "  SERVER=user@your-server npm run deploy"
fi
