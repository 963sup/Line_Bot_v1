#!/usr/bin/env bash
install_ripgrep() {
  if command -v rg >/dev/null; then return 0; fi
  install_system_packages ripgrep
}
