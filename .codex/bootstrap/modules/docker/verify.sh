#!/usr/bin/env bash
source "$BOOTSTRAP_DIR/modules/docker/common.sh"
verify_docker() {
  local daemon
  check_version docker '' docker --version
  daemon="$(command_version local_docker info --format '{{.ServerVersion}}' || true)"
  record_check docker-daemon "$daemon" ''
  if [[ "$(local_docker info --format '{{.Driver}}' 2>/dev/null || true)" == vfs || -n "${HTTP_PROXY:-}${http_proxy:-}" ]]; then
    check_version crane "$CRANE_VERSION" crane version
  fi
}
