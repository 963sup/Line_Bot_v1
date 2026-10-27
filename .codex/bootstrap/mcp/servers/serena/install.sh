#!/usr/bin/env bash
install_mcp_serena() {
  if [[ "$(command_version "$UV_TOOL_BIN_DIR/serena" --version || true)" == "$SERENA_VERSION" ]]; then return 0; fi
  # Serena v2 officially recommends an isolated uv-managed Python 3.13 tool environment.
  run_stage serena-install uv tool install --force --python "$SERENA_PYTHON_VERSION" "serena-agent==$SERENA_VERSION"
}
