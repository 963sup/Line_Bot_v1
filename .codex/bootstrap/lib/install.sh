#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/detect.sh"
prepare_install() {
  local command
  for command in curl tar sha256sum awk install flock; do require_command "$command"; done
  mkdir -p "$BOOTSTRAP_PREFIX/bin" "$BOOTSTRAP_PREFIX/downloads" "$BOOTSTRAP_ROOT/.artifacts/codex-cloud"
  exec 9>"$BOOTSTRAP_PREFIX/install.lock"
  flock -n 9 || { echo 'Another bootstrap installation is running in this checkout.' >&2; return 1; }
  BOOTSTRAP_LOG="$BOOTSTRAP_ROOT/.artifacts/codex-cloud/install-$(date -u +%Y%m%dT%H%M%S)-$$.log"
}
run_stage() {
  local label="$1" result; shift
  printf 'Preparing %s\n' "$label"
  if "$@" >>"$BOOTSTRAP_LOG" 2>&1; then return 0; else result=$?; fi
  printf 'Failed: %s (exit %s). Full log: %s\n' "$label" "$result" "$BOOTSTRAP_LOG" >&2
  return "$result"
}

fetch() {
  curl --fail --silent --show-error --location --connect-timeout 20 --max-time 180 "$1" --output "$2"
}

verify_download() {
  local archive="$1" checksums="$2" selected="$BOOTSTRAP_PREFIX/downloads/selected.sha256"
  awk -v file="$archive" '$2 == file || $2 == "*" file {print}' "$checksums" > "$selected"
  test -s "$selected" || { printf 'No checksum supplied for %s\n' "$archive" >&2; return 1; }
  (cd "$BOOTSTRAP_PREFIX/downloads" && sha256sum --check --status "$selected")
}

install_system_packages() {
  # Use signed distro repositories; update their index once per bootstrap invocation.
  require_command apt-get
  if [[ "$(id -u)" -eq 0 ]]; then
    if [[ -z "${BOOTSTRAP_APT_UPDATED:-}" ]]; then run_stage apt-update apt-get update; BOOTSTRAP_APT_UPDATED=1; fi
    run_stage apt-install env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"
  else
    require_command sudo
    if [[ -z "${BOOTSTRAP_APT_UPDATED:-}" ]]; then
      run_stage apt-update sudo -n --preserve-env=HTTP_PROXY,HTTPS_PROXY,NO_PROXY,http_proxy,https_proxy,no_proxy apt-get update
      BOOTSTRAP_APT_UPDATED=1
    fi
    run_stage apt-install sudo -n --preserve-env=HTTP_PROXY,HTTPS_PROXY,NO_PROXY,http_proxy,https_proxy,no_proxy env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"
  fi
}
