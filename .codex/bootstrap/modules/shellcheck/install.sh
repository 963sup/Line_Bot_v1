#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_shellcheck() {
  local arch archive checksum
  if [[ "$(command_version "$BOOTSTRAP_PREFIX/bin/shellcheck" --version || true)" == "$SHELLCHECK_VERSION" ]]; then return 0; fi
  arch="$(linux_arch x86_64 aarch64)"
  archive="shellcheck-v${SHELLCHECK_VERSION}.linux.${arch}.tar.gz"
  case "$arch" in
  x86_64) checksum=b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6 ;;
  aarch64) checksum=68a8133197a50beb8803f8d42f9908d1af1c5540d4bb05fdfca8c1fa47decefc ;;
  esac
  run_stage shellcheck-download fetch "https://github.com/koalaman/shellcheck/releases/download/v$SHELLCHECK_VERSION/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
  run_stage shellcheck-integrity verify_sha256 "$BOOTSTRAP_PREFIX/downloads/$archive" "$checksum"
  run_stage shellcheck-extract tar -xzf "$BOOTSTRAP_PREFIX/downloads/$archive" -C "$BOOTSTRAP_PREFIX/downloads" "shellcheck-v$SHELLCHECK_VERSION/shellcheck"
  install -m 755 "$BOOTSTRAP_PREFIX/downloads/shellcheck-v$SHELLCHECK_VERSION/shellcheck" "$BOOTSTRAP_PREFIX/bin/shellcheck"
}
