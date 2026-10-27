#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_postgres() {
  local actual
  actual="$(command_version psql --version || true)"
  if [[ "${actual%%.*}" == "$POSTGRES_MAJOR" ]]; then return 0; fi
  # Requires a signed distro repository providing this major. Client only; no server.
  install_system_packages "postgresql-client-$POSTGRES_MAJOR"
}
