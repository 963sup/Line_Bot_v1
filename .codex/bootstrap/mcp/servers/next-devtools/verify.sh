#!/usr/bin/env bash
verify_mcp_next_devtools() {
  if ! mcp_configured next-devtools command; then record_check next-devtools-config ''; fi
  check_executable next-devtools-launcher "$BOOTSTRAP_ROOT/node_modules/.bin/next-devtools-mcp"
}
