#!/usr/bin/env bash
verify_mcp_shadcn() {
  if ! mcp_configured shadcn command; then record_check shadcn-config ''; fi
  check_executable shadcn-launcher "$BOOTSTRAP_ROOT/apps/web/node_modules/.bin/shadcn"
}
