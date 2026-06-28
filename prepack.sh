#!/bin/sh
# cowork pack 在副本里跑 — 用户原工程已 build 时直接复用,避免重跑 30-90s 的 npm ci + build
# 触发 OpenClaw pi-agent waitForIdle 30s cleanup bug (#8643)
set -e
if ! command -v npm >/dev/null 2>&1; then
  echo "[prepack] ❌ npm not found; react-fastapi-monorepo needs Node.js"
  exit 1
fi

cd frontend

# === fast path: dist 已存在且不旧于源码,直接复用 ===
if [ -f dist/index.html ]; then
  # 找比 dist/index.html 新的源文件;一旦命中即停
  STALE=$(find src package.json package-lock.json \
    vite.config.ts vite.config.js vite.config.mts vite.config.mjs \
    tsconfig.json tsconfig.app.json index.html \
    -type f -newer dist/index.html -print 2>/dev/null | head -1)
  if [ -z "$STALE" ]; then
    echo "[prepack] ✅ dist 已是最新,跳过 npm ci + build  ($(du -sh dist | cut -f1))"
    exit 0
  fi
  echo "[prepack] dist 过期 (新于 dist 的文件: $STALE), 重 build"
fi

# === slow path: 真跑 npm ci + build ===
echo "[prepack] frontend: npm ci --include=dev (or install fallback)"
# 强制 include=dev(OpenClaw pod 环境 npm 全局配 omit=dev,会跳过 vite/typescript)
if [ -f package-lock.json ]; then
  npm ci --include=dev --no-audit
else
  npm install --include=dev --no-audit --prefer-offline
fi
echo "[prepack] frontend: npm run build"
npm run build
test -f dist/index.html || { echo "[prepack] ❌ frontend/dist/index.html 未生成"; exit 1; }
echo "[prepack] ✅ frontend/dist ready ($(du -sh dist | cut -f1))"
