#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLI_JS="${REPO_DIR}/bin/cli.js"

if ! command -v node >/dev/null 2>&1; then
  for candidate in \
    "/Applications/Antigravity.app/Contents/MacOS/Antigravity" \
    "$HOME/Applications/Antigravity.app/Contents/MacOS/Antigravity" \
    "/opt/Antigravity/antigravity" \
    "/opt/antigravity/antigravity"
  do
    if [ -x "$candidate" ]; then
      export ELECTRON_RUN_AS_NODE=1
      NODE_BIN="$candidate"
      break
    fi
  done
else
  NODE_BIN="$(command -v node)"
fi

if [ -z "${NODE_BIN:-}" ]; then
  echo "[错误] 未找到 Node.js，请先安装 Node.js (>= 18) 后重试。"
  exit 1
fi

"$NODE_BIN" "$CLI_JS" restore "$@"
