#!/usr/bin/env bash
verify_mcp_context7() {
  if mcp_configured context7 url; then
    record_pending context7 'Hosted endpoint configured; connection and account authorization require host verification.'
  else record_check context7-config ''; fi
}
