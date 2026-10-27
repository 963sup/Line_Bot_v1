#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_taplo() {
  local arch archive checksum
  if [[ "$(command_version "$BOOTSTRAP_PREFIX/bin/taplo" --version || true)" == "$TAPLO_VERSION" ]]; then return 0; fi
  arch="$(linux_arch x86_64 aarch64)"
  archive="taplo-linux-${arch}.gz"
  # Release assets have no upstream digest; pin the reviewed archive hashes.
  case "$arch" in
  x86_64) checksum=8fe196b894ccf9072f98d4e1013a180306e17d244830b03986ee5e8eabeb6156 ;;
  aarch64) checksum=033681d01eec8376c3fd38fa3703c79316f5e14bb013d859943b60a07bccdcc3 ;;
  esac
  run_stage taplo-download fetch "https://github.com/tamasfe/taplo/releases/download/$TAPLO_VERSION/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
  run_stage taplo-integrity verify_sha256 "$BOOTSTRAP_PREFIX/downloads/$archive" "$checksum"
  gzip -dc "$BOOTSTRAP_PREFIX/downloads/$archive" >"$BOOTSTRAP_PREFIX/downloads/taplo"
  install -m 755 "$BOOTSTRAP_PREFIX/downloads/taplo" "$BOOTSTRAP_PREFIX/bin/taplo"
}
