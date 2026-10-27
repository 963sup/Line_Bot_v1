#!/usr/bin/env bash
# Sourcing selects prepared paths; it never installs or starts services.
if [[ -n "${CODEX_BOOTSTRAP_LOADED:-}" ]]; then return 0; fi
CODEX_BOOTSTRAP_LOADED=1
BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP_ROOT="$(cd -- "$BOOTSTRAP_DIR/../.." && pwd)"
BOOTSTRAP_PREFIX="$BOOTSTRAP_ROOT/.tools/codex"
source "$BOOTSTRAP_DIR/config/tools.env"
source "$BOOTSTRAP_DIR/config/mcp.env"
source "$BOOTSTRAP_DIR/config/versions.env"
export PATH="$BOOTSTRAP_PREFIX/bin:$BOOTSTRAP_PREFIX/node/bin:$BOOTSTRAP_ROOT/node_modules/.bin:$PATH"
export UV_CACHE_DIR="$BOOTSTRAP_ROOT/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$BOOTSTRAP_PREFIX/python"
export UV_TOOL_DIR="$BOOTSTRAP_PREFIX/uv-tools"
export UV_TOOL_BIN_DIR="$BOOTSTRAP_PREFIX/bin"
export NPM_CONFIG_CACHE="$BOOTSTRAP_ROOT/.cache/npm"
export SERENA_HOME="$BOOTSTRAP_ROOT/.cache/serena"
export PLAYWRIGHT_BROWSERS_PATH="$BOOTSTRAP_ROOT/.cache/ms-playwright"
cd "$BOOTSTRAP_ROOT"

require_command() {
  command -v "$1" >/dev/null || { printf 'Missing prerequisite: %s\n' "$1" >&2; return 1; }
}
node_pin() { tr -d '\r\n' < "$BOOTSTRAP_ROOT/.node-version"; }
pnpm_pin() {
  node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(!/^pnpm@[0-9]+\.[0-9]+\.[0-9]+$/.test(p.packageManager)) throw Error("Expected an exact pnpm pin"); console.log(p.packageManager.slice(5))' "$BOOTSTRAP_ROOT/package.json"
}
workspace_version() {
  node -e 'const fs=require("node:fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).version)' "$BOOTSTRAP_ROOT/node_modules/$1/package.json"
}
bootstrap_fingerprint() {
  {
    printf '%s\n' "$BOOTSTRAP_TOOLS" "$BOOTSTRAP_MCP_SERVERS"
    for file in .node-version package.json pnpm-workspace.yaml pnpm-lock.yaml .codex/config.toml apps/*/package.json packages/*/package.json; do
      [[ ! -f "$file" ]] || sha256sum "$file"
    done
    while IFS= read -r file; do sha256sum "$file"; done < <(find .codex/bootstrap -type f \( -name '*.sh' -o -name '*.env' \) | sort)
  } | sha256sum | awk '{print $1}'
}
