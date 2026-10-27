#!/usr/bin/env bash
verify_docker() {
  local daemon
  check_version docker '' docker --version
  daemon="$(command_version docker info --format '{{.ServerVersion}}' || true)"
  record_check docker-daemon "$daemon" ''
}
