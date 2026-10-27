#!/usr/bin/env bash
verify_postgres() {
  local actual major=''
  actual="$(command_version psql --version || true)"
  if [[ -n "$actual" ]]; then major="${actual%%.*}"; fi
  record_check postgres-client-major "$major" "$POSTGRES_MAJOR"
}
