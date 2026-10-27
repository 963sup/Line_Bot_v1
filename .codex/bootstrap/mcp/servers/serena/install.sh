#!/usr/bin/env bash
install_mcp_serena() {
  if [[ "$(command_version "$UV_TOOL_BIN_DIR/serena" --version || true)" == "$SERENA_VERSION" ]]; then return 0; fi
  run_stage serena-install uv tool install --force --python "$PYTHON_VERSION" "serena-agent==$SERENA_VERSION"
}
