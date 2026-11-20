#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLI_JS="${REPO_DIR}/bin/cli.js"

echo "============================================================"
echo "  Antigravity 简体中文汉化工具 (antigravity-zh-cn)"
echo "============================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  # Fallback to Antigravity's bundled Electron Node runtime on macOS/Linux
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

"$NODE_BIN" "$CLI_JS" install "$@"

# On macOS, re-sign the app bundle with an ad-hoc signature so Gatekeeper / Electron accepts the updated ASAR
if [ "$(uname -s)" = "Darwin" ]; then
  for app_bundle in \
    "/Applications/Antigravity.app" \
    "$HOME/Applications/Antigravity.app"
  do
    if [ -d "$app_bundle" ] && command -v codesign >/dev/null 2>&1; then
      echo
      echo "[macOS] 正在为 ${app_bundle} 执行本地自签名..."
      codesign --force --deep --sign - "$app_bundle" && echo "[macOS] 自签名完成。" || echo "[macOS] 自签名跳过或需要权限，如闪退请手动运行: codesign --force --deep --sign - \"${app_bundle}\""
      break
    fi
  done
fi
