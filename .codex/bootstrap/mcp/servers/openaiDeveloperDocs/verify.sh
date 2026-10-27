#!/usr/bin/env bash
verify_mcp_openaiDeveloperDocs() {
  if mcp_configured openaiDeveloperDocs url; then
    record_pending openaiDeveloperDocs 'Official hosted documentation endpoint configured; network access, host handshake and a read-only tool call remain unverified.'
  else
    record_check openaiDeveloperDocs-config ''
  fi
}
