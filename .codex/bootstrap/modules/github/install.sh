#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_github() {
  local arch archive
  if [[ "$(command_version gh --version || true)" == "$GITHUB_VERSION" ]]; then return 0; fi
  arch="$(linux_arch amd64 arm64)"
  archive="gh_${GITHUB_VERSION}_linux_${arch}.tar.gz"
  run_stage github-download fetch "https://github.com/cli/cli/releases/download/v$GITHUB_VERSION/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
  run_stage github-checksums fetch "https://github.com/cli/cli/releases/download/v$GITHUB_VERSION/gh_${GITHUB_VERSION}_checksums.txt" "$BOOTSTRAP_PREFIX/downloads/gh-checksums.txt"
  run_stage github-integrity verify_download "$archive" "$BOOTSTRAP_PREFIX/downloads/gh-checksums.txt"
  run_stage github-extract tar -xzf "$BOOTSTRAP_PREFIX/downloads/$archive" -C "$BOOTSTRAP_PREFIX/downloads"
  install -m 755 "$BOOTSTRAP_PREFIX/downloads/gh_${GITHUB_VERSION}_linux_${arch}/bin/gh" "$BOOTSTRAP_PREFIX/bin/gh"
}
