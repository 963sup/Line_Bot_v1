#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_docker() {
  require_command docker || {
    echo 'Enable a Docker-capable Cloud image/connection before selecting docker in config/tools.env.' >&2
    return 1
  }
  run_stage docker-daemon docker info --format '{{.ServerVersion}}'
}
