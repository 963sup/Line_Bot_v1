#!/usr/bin/env bash
verify_mcp_github() {
  if ! mcp_configured github url; then record_check github-mcp-config ''; fi
  if ! python -c 'import sys,tomllib; c=tomllib.load(open(sys.argv[1],"rb")); s=c.get("mcp_servers",{}).get("github",{}); sys.exit(0 if s.get("bearer_token_env_var")=="GITHUB_MCP_TOKEN" else 1)' "$BOOTSTRAP_ROOT/.codex/config.toml" >/dev/null 2>&1; then
    record_check github-mcp-token-reference '' GITHUB_MCP_TOKEN
  fi
  if [[ -n "${GITHUB_MCP_TOKEN:-}" ]]; then
    record_check github-mcp-token-binding present
  else
    record_check github-mcp-token-binding '' 'GITHUB_MCP_TOKEN network secret'
  fi
  record_pending github-mcp 'Hosted endpoint configured; token validity, proxy delivery and host handshake remain unverified.'
}
