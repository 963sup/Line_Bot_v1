#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_node() {
  local expected arch archive
  expected="$(node_pin)"
  [[ "$expected" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid .node-version' >&2; return 1; }
  if [[ "$(command_version node --version || true)" != "$expected" ]]; then
    arch="$(linux_arch x64 arm64)"
    archive="node-v$expected-linux-$arch.tar.gz"
    run_stage node-download fetch "https://nodejs.org/dist/v$expected/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
    run_stage node-checksums fetch "https://nodejs.org/dist/v$expected/SHASUMS256.txt" "$BOOTSTRAP_PREFIX/downloads/node-checksums.txt"
    run_stage node-integrity verify_download "$archive" "$BOOTSTRAP_PREFIX/downloads/node-checksums.txt"
    run_stage node-extract tar -xzf "$BOOTSTRAP_PREFIX/downloads/$archive" -C "$BOOTSTRAP_PREFIX"
    ln -sfn "$BOOTSTRAP_PREFIX/node-v$expected-linux-$arch" "$BOOTSTRAP_PREFIX/node"
  fi
  expected="$(pnpm_pin)"
  if [[ "$(command_version pnpm --version || true)" != "$expected" ]]; then
    run_stage pnpm-install npm install --global --prefix "$BOOTSTRAP_PREFIX" "pnpm@$expected" --no-audit --no-fund
  fi
}
