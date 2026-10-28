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
source "$BOOTSTRAP_DIR/mcp/servers/serena/install.sh"
for tool in $tools; do
  case "$tool" in supabase | vercel) continue ;; esac
  source "$BOOTSTRAP_DIR/modules/$tool/install.sh"
  "install_$tool"
  # Serena is needed by the Codex host and must not wait for the slower
  # Docker/Supabase and workspace installation stages below. uv is installed
  # before this hook and owns Serena's isolated Python environment.
  if [[ "$tool" == uv && " $BOOTSTRAP_MCP_SERVERS " == *" serena "* ]]; then
    install_mcp_serena
  fi
done
run_stage workspace-install env CI=true pnpm install --frozen-lockfile --prefer-offline
# Serena v2 LSP resolves this binary from the workspace; verify it immediately
# after the single standard dependency installation.
[[ -x "$BOOTSTRAP_ROOT/node_modules/.bin/typescript-language-server" ]] || {
  echo 'typescript-language-server is required by Serena v2 LSP but was not installed' >&2
  exit 1
}
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
