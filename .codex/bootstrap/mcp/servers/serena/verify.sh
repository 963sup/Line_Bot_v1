#!/usr/bin/env bash
verify_mcp_serena() {
  if ! mcp_configured serena command; then record_check serena-config ''; fi
  check_version serena-launcher "$SERENA_VERSION" "$UV_TOOL_BIN_DIR/serena" --version
  # Serena's configured TypeScript LSP is a workspace dependency. Keep it in
  # the same frozen-lockfile installation rather than installing a second copy.
  check_workspace_cli typescript-language-server
}
