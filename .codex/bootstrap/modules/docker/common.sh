#!/usr/bin/env bash
# The managed image supplies Docker. Never install a second daemon or redirect to a remote one.
local_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
