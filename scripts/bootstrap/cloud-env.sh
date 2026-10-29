#!/usr/bin/env bash
# Source this file in subsequent shells; never replace host HOME or CODEX_HOME.
CLOUD_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
export PNPM_HOME="$CLOUD_REPO_ROOT/.cache/pnpm-home"
export COREPACK_HOME="$CLOUD_REPO_ROOT/.cache/corepack"
export NPM_CONFIG_CACHE="$CLOUD_REPO_ROOT/.cache/npm-cache"
export XDG_CACHE_HOME="$CLOUD_REPO_ROOT/.cache/xdg-cache"
export XDG_DATA_HOME="$CLOUD_REPO_ROOT/.cache/xdg-data"
export XDG_CONFIG_HOME="$CLOUD_REPO_ROOT/.cache/xdg-config"
export XDG_STATE_HOME="$CLOUD_REPO_ROOT/.cache/xdg-state"
export SERENA_HOME="$CLOUD_REPO_ROOT/.cache/serena-home"
export UV_CACHE_DIR="$CLOUD_REPO_ROOT/.cache/uv/cache"
export UV_TOOL_DIR="$CLOUD_REPO_ROOT/.cache/uv/tools"
export UV_TOOL_BIN_DIR="$CLOUD_REPO_ROOT/.cache/uv/bin"
export UV_PYTHON_BIN_DIR="$CLOUD_REPO_ROOT/.cache/uv/python-bin"
export UV_PYTHON_INSTALL_DIR="$CLOUD_REPO_ROOT/.cache/uv/python"
export PATH="$PNPM_HOME:$UV_TOOL_BIN_DIR:$CLOUD_REPO_ROOT/.tools/codex/bin:$CLOUD_REPO_ROOT/node_modules/.bin:$PATH"

# Provider CLIs must never fall back to read-only home directories.
export SUPABASE_HOME="$CLOUD_REPO_ROOT/.cache/supabase"
# Vercel selects the first existing XDG data directory before legacy ~/.now.
mkdir -p "$SUPABASE_HOME" "$XDG_DATA_HOME/com.vercel.cli" "$XDG_CACHE_HOME/com.vercel.cli"
chmod 700 "$SUPABASE_HOME" "$XDG_DATA_HOME/com.vercel.cli"
