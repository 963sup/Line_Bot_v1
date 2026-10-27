#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_uv() {
  local arch archive
  if [[ "$(command_version uv --version || true)" == "$UV_VERSION" && "$(command_version uvx --version || true)" == "$UV_VERSION" ]]; then return 0; fi
  arch="$(linux_arch x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu)"
  archive="uv-$arch.tar.gz"
  run_stage uv-download fetch "https://github.com/astral-sh/uv/releases/download/$UV_VERSION/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
  run_stage uv-checksums fetch "https://github.com/astral-sh/uv/releases/download/$UV_VERSION/$archive.sha256" "$BOOTSTRAP_PREFIX/downloads/uv-checksums.txt"
  run_stage uv-integrity verify_download "$archive" "$BOOTSTRAP_PREFIX/downloads/uv-checksums.txt"
  run_stage uv-extract tar -xzf "$BOOTSTRAP_PREFIX/downloads/$archive" -C "$BOOTSTRAP_PREFIX/downloads"
  install -m 755 "$BOOTSTRAP_PREFIX/downloads/uv-$arch/uv" "$BOOTSTRAP_PREFIX/bin/uv"
  install -m 755 "$BOOTSTRAP_PREFIX/downloads/uv-$arch/uvx" "$BOOTSTRAP_PREFIX/bin/uvx"
}
