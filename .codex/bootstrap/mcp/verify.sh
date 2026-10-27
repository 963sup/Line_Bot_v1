#!/usr/bin/env bash
verify_mcp() {
  local server
  for server in $BOOTSTRAP_MCP_SERVERS; do
    source "$BOOTSTRAP_DIR/mcp/servers/$server/verify.sh"
    "verify_mcp_${server//-/_}"
  done
  record_pending codex-session 'Tool registration and real tool calls require verification in the Codex host.'
}
