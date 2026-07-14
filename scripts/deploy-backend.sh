#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"

on_error() {
  echo "[deploy] failed at line $1" >&2
}
trap 'on_error "$LINENO"' ERR

for command in git npm pm2; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "[deploy] required command not found: $command" >&2
    exit 1
  fi
done

echo "[deploy] updating $APP_DIR from origin/$BRANCH"
cd "$APP_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[deploy] working tree is not clean; refusing to overwrite server changes" >&2
  exit 1
fi

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[deploy] installing production dependencies and building"
npm ci
npm run build
npm prune --omit=dev

echo "[deploy] restarting backend process"
pm2 startOrRestart ecosystem.config.cjs --env production
pm2 save

echo "[deploy] complete"
pm2 show semraz-backend
