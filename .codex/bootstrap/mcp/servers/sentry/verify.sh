#!/usr/bin/env bash
verify_mcp_sentry() {
  if mcp_configured sentry url; then
    record_pending sentry 'Hosted endpoint configured; connection and account authorization require host verification.'
  else record_check sentry-config ''; fi
}
