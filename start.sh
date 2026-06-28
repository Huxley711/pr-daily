#!/usr/bin/env bash
# start.sh - 由 Guard 应用拉起业务主进程；末行必须 exec
# 由 guard-transform 模板渲染生成
set -eo pipefail
cd "$(dirname "$0")"

export APP_PORT="${APP_PORT:-3000}"
cd backend
exec python3 -m uvicorn app:app --host 0.0.0.0 --port ${APP_PORT} 2>&1
