#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
source "$BOOTSTRAP_DIR/modules/docker/common.sh"
install_docker() {
  require_command docker || {
    echo 'Enable a Docker-capable Cloud image/connection before selecting docker in config/tools.env.' >&2
    return 1
  }
  if ! run_stage docker-daemon local_docker info --format '{{.ServerVersion}}'; then
    echo 'The managed Docker daemon is unavailable. Recover the environment; bootstrap does not install or restart daemons.' >&2
    return 1
  fi
  if [[ "$(local_docker info --format '{{.Driver}}')" == vfs || -n "${HTTP_PROXY:-}${http_proxy:-}" ]]; then
    local archive
    if [[ "$(command_version crane version || true)" == "$CRANE_VERSION" ]]; then return 0; fi
    archive="$(linux_arch go-containerregistry_Linux_x86_64.tar.gz go-containerregistry_Linux_arm64.tar.gz)"
    run_stage crane-download fetch "https://github.com/google/go-containerregistry/releases/download/v$CRANE_VERSION/$archive" "$BOOTSTRAP_PREFIX/downloads/$archive"
    run_stage crane-checksums fetch "https://github.com/google/go-containerregistry/releases/download/v$CRANE_VERSION/checksums.txt" "$BOOTSTRAP_PREFIX/downloads/crane-checksums.txt"
    run_stage crane-integrity verify_download "$archive" "$BOOTSTRAP_PREFIX/downloads/crane-checksums.txt"
    run_stage crane-extract tar -xzf "$BOOTSTRAP_PREFIX/downloads/$archive" -C "$BOOTSTRAP_PREFIX/bin" crane
  fi
}
