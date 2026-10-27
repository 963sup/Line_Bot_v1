#!/usr/bin/env bash
set -euo pipefail
test_root="$(mktemp -d)"
trap 'rm -rf "$test_root"' EXIT
cat >"$test_root/docker" <<'SH'
#!/usr/bin/env bash
set -eu
[[ -z "${DOCKER_HOST:-}${DOCKER_CONTEXT:-}${DOCKER_TLS:-}${DOCKER_TLS_VERIFY:-}${DOCKER_CERT_PATH:-}" ]]
[[ "$*" == '--host=unix:///var/run/docker.sock info --format {{.ServerVersion}}' ]]
printf '28.4.0\n'
SH
chmod +x "$test_root/docker"
source "$(dirname -- "${BASH_SOURCE[0]}")/../modules/docker/common.sh"
export DOCKER_HOST=tcp://unrelated:2375 DOCKER_CONTEXT=unrelated DOCKER_TLS=1 DOCKER_TLS_VERIFY=1 DOCKER_CERT_PATH=/unrelated
export PATH="$test_root:$PATH"
[[ "$(local_docker info --format '{{.ServerVersion}}')" == '28.4.0' ]]
printf 'Docker bootstrap uses the existing local daemon and clears inherited endpoint selectors.\n'
