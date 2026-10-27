#!/usr/bin/env bash
install_mcp() {
  local server
  for server in $BOOTSTRAP_MCP_SERVERS; do
    if [[ -f "$BOOTSTRAP_DIR/mcp/servers/$server/install.sh" ]]; then
      source "$BOOTSTRAP_DIR/mcp/servers/$server/install.sh"
      "install_mcp_${server//-/_}"
    fi
  done
  # Hosted servers are connected by the Codex host, not installed in the container.
}
