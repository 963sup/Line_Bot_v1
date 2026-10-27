#!/usr/bin/env bash
install_build() {
  local command missing=0
  for command in make gcc g++ pkg-config; do
    if ! command -v "$command" >/dev/null; then missing=1; fi
  done
  if ((missing == 0)); then return 0; fi
  install_system_packages build-essential pkg-config
}
