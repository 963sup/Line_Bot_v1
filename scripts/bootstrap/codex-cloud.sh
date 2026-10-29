#!/usr/bin/env bash
set -euo pipefail

cd /workspace/Line_Bot_v1

# Shared with MCP subprocesses and later interactive shells.
source "$PWD/scripts/bootstrap/cloud-env.sh"
mkdir -p "$PNPM_HOME" "$COREPACK_HOME" "$NPM_CONFIG_CACHE" \
  "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" \
  "$SERENA_HOME" "$UV_CACHE_DIR" "$UV_TOOL_DIR" "$UV_TOOL_BIN_DIR" \
  "$UV_PYTHON_INSTALL_DIR"

for tool in \
  codex \
  docker \
  git \
  curl \
  tar \
  node \
  npm \
  python3 \
  corepack
do
  command -v "$tool" >/dev/null || {
    echo "Missing image prerequisite: $tool"
    exit 1
  }
done

docker info >/dev/null

# Docker vfs 的 Supabase 映像準備需要 crane；使用固定版本的官方 binary。
if ! command -v crane >/dev/null; then
  CRANE_VERSION="0.20.3"
  case "$(uname -m)" in
    x86_64) CRANE_ARCH="x86_64" ;;
    aarch64 | arm64) CRANE_ARCH="arm64" ;;
    *) echo "Unsupported crane architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  CRANE_ASSET="go-containerregistry_Linux_${CRANE_ARCH}.tar.gz"
  CRANE_CACHE="$PWD/.cache/crane/$CRANE_VERSION"
  CRANE_RELEASE="https://github.com/google/go-containerregistry/releases/download/v${CRANE_VERSION}"
  mkdir -p "$CRANE_CACHE" "$PWD/.tools/codex/bin"
  curl -fLsS "$CRANE_RELEASE/$CRANE_ASSET" -o "$CRANE_CACHE/$CRANE_ASSET"
  curl -fLsS "$CRANE_RELEASE/checksums.txt" -o "$CRANE_CACHE/checksums.txt"
  (
    cd "$CRANE_CACHE"
    awk -v asset="$CRANE_ASSET" '$2 == asset { print; found = 1 } END { if (!found) exit 1 }' checksums.txt > crane.sha256
    sha256sum --check crane.sha256
  )
  tar -xzf "$CRANE_CACHE/$CRANE_ASSET" -C "$PWD/.tools/codex/bin" crane
fi

crane version

if ! command -v uv >/dev/null || ! command -v uvx >/dev/null; then
  curl -fLsS https://astral.sh/uv/install.sh -o "$XDG_CACHE_HOME/uv-install.sh"
  UV_UNMANAGED_INSTALL="$UV_TOOL_BIN_DIR" sh "$XDG_CACHE_HOME/uv-install.sh"
fi

uv --version
uvx --version

uv python install 3.13
uv tool install --python 3.13 'serena-agent==2.1.0'

SERENA_EXECUTABLE="$(uv tool dir --bin)/serena"

test -x "$SERENA_EXECUTABLE"
"$SERENA_EXECUTABLE" --version

node --input-type=module -e '
import fs from "node:fs";

const expected = fs
  .readFileSync(".node-version", "utf8")
  .trim()
  .replace(/^v/, "");

if (process.versions.node !== expected) {
  throw new Error(
    "Expected Node " + expected + "; got " + process.versions.node,
  );
}
'

# Cloud already provides pnpm on PATH; enabling Corepack would try to write
# shims beside the read-only Node installation.
corepack install
corepack enable --install-directory "$PNPM_HOME"

command -v pnpm >/dev/null || {
  echo "pnpm is unavailable after Corepack setup"
  exit 1
}

pnpm --version
pnpm install --frozen-lockfile --store-dir "$PWD/.cache/pnpm-store"

test -x node_modules/.bin/typescript-language-server
test -x node_modules/.bin/next-devtools-mcp
test -x node_modules/.bin/supabase
test -x apps/web/node_modules/.bin/shadcn

pnpm exec typescript-language-server --version
pnpm exec supabase --version

# 使用 Repomix 產出固定用途的分析 context。
npx --yes repomix --version
mkdir -p .repomix
npx --yes repomix --config repomix.overview.config.json
npx --yes repomix --config repomix.docs.config.json
npx --yes repomix --config repomix.source.config.json
npx --yes repomix --config repomix.json.config.json
npx --yes repomix --config repomix.sql.config.json
npx --yes repomix --config repomix.tests.config.json
npx --yes repomix --config repomix.mjs.config.json
npx --yes repomix --config repomix.sh.config.json

for output in \
  .repomix/01-repository-overview.xml \
  .repomix/02-docs-full.xml \
  .repomix/03-source-context.xml \
  .repomix/04-json-context.json \
  .repomix/05-sql-context.sql \
  repomix-tests.xml \
  .repomix/06-mjs-context.xml \
  .repomix/07-shell-context.xml
do
  test -s "$output"
done

"$SERENA_EXECUTABLE" init

# 信任目前專案，讓 Serena 使用 .serena/project.yml
# 中已固定的 TypeScript language server。
python3 - <<'PY'
from pathlib import Path

config = Path(".cache/serena-home/serena_config.yml")
text = config.read_text(encoding="utf-8")

empty = "trusted_project_path_patterns: []"
configured = """trusted_project_path_patterns:
  - "/workspace/Line_Bot_v1"
"""

if empty in text:
    text = text.replace(empty, configured)
elif '"/workspace/Line_Bot_v1"' not in text:
    marker = "trusted_project_path_patterns:"
    start = text.find(marker)

    if start == -1:
        text += "\n" + configured
    else:
        line_end = text.find("\n", start)
        text = (
            text[: line_end + 1]
            + '  - "/workspace/Line_Bot_v1"\n'
            + text[line_end + 1 :]
        )

config.write_text(text, encoding="utf-8")
PY

# 確認 Serena 可使用專案內的 TypeScript language server。
"$SERENA_EXECUTABLE" download-ls-dependencies typescript
# 預先建立專案索引，供後續 Serena session 重用。
"$SERENA_EXECUTABLE" project index
"$SERENA_EXECUTABLE" project health-check

uv run --python 3.13 python - <<'PY'
import os
import pathlib
import subprocess
import sys
import tempfile
import urllib.request

revision = "49f948faa9258a0c61caceaf225e179651397431"
base = f"https://raw.githubusercontent.com/openai/skills/{revision}/skills/.system/skill-installer/scripts"

skills_home = pathlib.Path(
    os.environ.get("CODEX_HOME", str(pathlib.Path.home() / ".codex"))
) / "skills"

requested = [
    (".system", "skill-installer"),
    (".curated", "gh-address-comments"),
    (".curated", "gh-fix-ci"),
    (".curated", "openai-docs"),
    (".curated", "vercel-deploy"),
    (".curated", "chatgpt-apps"),
    (".curated", "define-goal"),
]

with tempfile.TemporaryDirectory(prefix="codex-skills-") as directory:
    temporary = pathlib.Path(directory)

    for filename in ("install-skill-from-github.py", "github_utils.py"):
        urllib.request.urlretrieve(
            f"{base}/{filename}",
            temporary / filename,
        )

    for category, name in requested:
        if (skills_home / name / "SKILL.md").is_file():
            continue

        subprocess.run(
            [
                sys.executable,
                str(temporary / "install-skill-from-github.py"),
                "--repo",
                "openai/skills",
                "--path",
                f"skills/{category}/{name}",
                "--ref",
                revision,
                "--method",
                "download",
            ],
            check=True,
        )
PY

# 避免重複註冊 MCP。
for server in \
  openaiDeveloperDocs \
  context7 \
  github \
  serena \
  repomix \
  next-devtools \
  shadcn
do
  codex mcp remove "$server" >/dev/null 2>&1 || true
done

codex mcp add \
  openaiDeveloperDocs \
  --url https://developers.openai.com/mcp

codex mcp add \
  context7 \
  --url https://mcp.context7.com/mcp \
  --bearer-token-env-var CONTEXT7_API_KEY

codex mcp add \
  github \
  --url https://api.githubcopilot.com/mcp/ \
  --bearer-token-env-var GITHUB_MCP_TOKEN

# MCP subprocess 使用與 .codex/config.toml 相同的固定版本 uv 啟動方式。
codex mcp add \
  serena \
  -- bash "$PWD/scripts/bootstrap/serena-mcp.sh" \
  start-mcp-server \
  --project-from-cwd \
  --context=codex \
  --agent-interface=REPL \
  --open-web-dashboard=false

# MCP subprocess 明確沿用 workspace npm cache。
codex mcp add \
  repomix \
  -- env \
  "NPM_CONFIG_CACHE=$NPM_CONFIG_CACHE" \
  "$(command -v npx)" --yes repomix --mcp

codex mcp add \
  next-devtools \
  -- /workspace/Line_Bot_v1/node_modules/.bin/next-devtools-mcp

codex mcp add \
  shadcn \
  -- "$(command -v pnpm)" \
  --dir /workspace/Line_Bot_v1/apps/web \
  exec shadcn mcp

node packages/integration-supabase/scripts/local-stack.mjs start

codex mcp list
