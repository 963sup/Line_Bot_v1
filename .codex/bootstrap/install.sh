#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"
# Launch modes select prepared paths; they never install or fetch.
case "${1:-}" in
--exec)
  shift
  [[ $# -gt 0 ]] || {
    echo 'Missing command' >&2
    exit 2
  }
  exec "$@"
  ;;
--serena)
  shift
  exec "$UV_TOOL_BIN_DIR/serena" "$@"
  ;;
'') ;;
*)
  echo 'Usage: bash .codex/bootstrap/install.sh [--exec command...|--serena args...]' >&2
  exit 2
  ;;
esac
source "$BOOTSTRAP_DIR/lib/install.sh"
validate_mcp_selection
tools="$(selected_tools)"
prepare_install
for tool in $tools; do
  case "$tool" in supabase | vercel) continue ;; esac
  source "$BOOTSTRAP_DIR/modules/$tool/install.sh"
  "install_$tool"
done
run_stage workspace-install pnpm install --frozen-lockfile --prefer-offline
for tool in $tools; do
  case "$tool" in supabase | vercel)
    source "$BOOTSTRAP_DIR/modules/$tool/install.sh"
    "install_$tool"
    ;;
  esac
done
source "$BOOTSTRAP_DIR/mcp/install.sh"
install_mcp
bash "$BOOTSTRAP_DIR/verify.sh"
bootstrap_fingerprint >"$BOOTSTRAP_PREFIX/installed.sha256"
printf 'Bootstrap installation completed; MCP host/session remains unverified. Log: %s\n' "$BOOTSTRAP_LOG"
