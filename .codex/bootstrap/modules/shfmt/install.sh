#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_shfmt() {
  local arch archive checksum
  if [[ "$(command_version "$BOOTSTRAP_PREFIX/bin/shfmt" --version || true)" == "$SHFMT_VERSION" ]]; then return 0; fi
  arch="$(linux_arch amd64 arm64)"
  archive="shfmt_v${SHFMT_VERSION}_linux_${arch}"
  case "$arch" in
  amd64) checksum=76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf ;;
  arm64) checksum=5f2db09dae91fca848f7adbdd014632e921a383863a2ad7e0450ad3aba0c6489 ;;
  esac
  run_stage shfmt-download fetch "https://github.com/mvdan/sh/releases/download/v$SHFMT_VERSION/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
  run_stage shfmt-integrity verify_sha256 "$BOOTSTRAP_PREFIX/downloads/$archive" "$checksum"
  install -m 755 "$BOOTSTRAP_PREFIX/downloads/$archive" "$BOOTSTRAP_PREFIX/bin/shfmt"
}
