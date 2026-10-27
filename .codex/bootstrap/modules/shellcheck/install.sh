#!/usr/bin/env bash
install_shellcheck() {
  if command -v shellcheck >/dev/null; then return 0; fi
  # Install the upstream binary through PyPI inside the bootstrap prefix.
  run_stage shellcheck-install uv tool install --force shellcheck-py
}
