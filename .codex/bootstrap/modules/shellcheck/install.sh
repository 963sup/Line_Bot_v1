#!/usr/bin/env bash
install_shellcheck() {
  if command -v shellcheck >/dev/null; then return 0; fi
  install_system_packages shellcheck
}
