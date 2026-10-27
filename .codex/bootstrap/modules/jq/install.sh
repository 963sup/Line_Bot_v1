#!/usr/bin/env bash
install_jq() {
  if command -v jq >/dev/null; then return 0; fi
  install_system_packages jq
}
