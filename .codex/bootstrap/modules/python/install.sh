#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_python() {
  local python_path
  if [[ "$(command_version python --version || true)" == "$PYTHON_VERSION" ]]; then return 0; fi
  run_stage python-install uv python install "$PYTHON_VERSION"
  python_path="$(uv python find "$PYTHON_VERSION")"
  ln -sfn "$python_path" "$BOOTSTRAP_PREFIX/bin/python"
  ln -sfn "$python_path" "$BOOTSTRAP_PREFIX/bin/python3"
}
