#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
command_version() {
  local output
  output="$("$@" 2>&1)" || return 1
  [[ "$output" =~ ([0-9]+\.[0-9]+(\.[0-9]+)?) ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}
linux_arch() {
  case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) printf '%s\n' "$1" ;;
  Linux/aarch64 | Linux/arm64) printf '%s\n' "$2" ;;
  *)
    printf 'Unsupported bootstrap platform: %s/%s\n' "$(uname -s)" "$(uname -m)" >&2
    return 1
    ;;
  esac
}

selected_tools() {
  local name seen=' node uv python '
  printf '%s\n' node uv python
  for name in $BOOTSTRAP_TOOLS; do
    case "$name" in
    node | uv | python) ;;
    github | ripgrep | jq | actionlint | shfmt | taplo | shellcheck | build | browser | supabase | vercel | cloudflare | docker | postgres)
      if [[ "$seen" != *" $name "* ]]; then
        printf '%s\n' "$name"
        seen+="$name "
      fi
      ;;
    *)
      printf 'Unknown bootstrap tool: %s\n' "$name" >&2
      return 1
      ;;
    esac
  done
}
validate_mcp_selection() {
  local name
  for name in $BOOTSTRAP_MCP_SERVERS; do
    case "$name" in github | context7 | shadcn | next-devtools | sentry | serena) ;; *)
      printf 'Unknown MCP server: %s\n' "$name" >&2
      return 1
      ;;
    esac
  done
}
