#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_actionlint() {
  local arch archive
  if [[ "$(command_version "$BOOTSTRAP_PREFIX/bin/actionlint" -version || true)" == "$ACTIONLINT_VERSION" ]]; then return 0; fi
  arch="$(linux_arch amd64 arm64)"
  archive="actionlint_${ACTIONLINT_VERSION}_linux_${arch}.tar.gz"
  run_stage actionlint-download fetch "https://github.com/rhysd/actionlint/releases/download/v$ACTIONLINT_VERSION/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
  run_stage actionlint-checksums fetch "https://github.com/rhysd/actionlint/releases/download/v$ACTIONLINT_VERSION/actionlint_${ACTIONLINT_VERSION}_checksums.txt" "$BOOTSTRAP_PREFIX/downloads/actionlint-checksums.txt"
  run_stage actionlint-integrity verify_download "$archive" "$BOOTSTRAP_PREFIX/downloads/actionlint-checksums.txt"
  run_stage actionlint-extract tar -xzf "$BOOTSTRAP_PREFIX/downloads/$archive" -C "$BOOTSTRAP_PREFIX/bin" actionlint
}
