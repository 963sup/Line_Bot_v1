#!/usr/bin/env bash
set -euo pipefail

cd /workspace/Line_Bot_v1

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

if ! command -v uv >/dev/null || ! command -v uvx >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

# 使用 workspace 可寫入的快取路徑，避免 Cloud 的 HOME 唯讀。
export PNPM_HOME="$PWD/.cache/pnpm-home"
export NPM_CONFIG_CACHE="$PWD/.cache/npm-cache"
export XDG_CACHE_HOME="$PWD/.cache/xdg-cache"
export XDG_DATA_HOME="$PWD/.cache/xdg-data"
export XDG_CONFIG_HOME="$PWD/.cache/xdg-config"
export XDG_STATE_HOME="$PWD/.cache/xdg-state"
export CODEX_HOME="$PWD/.cache/codex"
export SERENA_HOME="$PWD/.cache/serena-home"
export HOME="$PWD/.cache/home"

mkdir -p \
  "$PNPM_HOME" \
  "$NPM_CONFIG_CACHE" \
  "$XDG_CACHE_HOME" \
  "$XDG_DATA_HOME" \
  "$XDG_CONFIG_HOME" \
  "$XDG_STATE_HOME" \
  "$CODEX_HOME" \
  "$SERENA_HOME" \
  "$HOME"

export PATH="$HOME/.local/bin:$PNPM_HOME:$PWD/.tools/codex/bin:$PWD/node_modules/.bin:$PATH"

uv --version
uvx --version

uv python install 3.13
uv tool install --python 3.13 'serena-agent==2.1.0'

SERENA_EXECUTABLE="$(uv tool dir --bin)/serena"

if [[ ! -x "$SERENA_EXECUTABLE" ]]; then
  SERENA_EXECUTABLE="$PWD/.tools/codex/bin/serena"
fi

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

command -v pnpm >/dev/null || {
  echo "pnpm is unavailable after Corepack setup"
  exit 1
}

pnpm --version
pnpm install --frozen-lockfile

test -x node_modules/.bin/typescript-language-server
test -x node_modules/.bin/next-devtools-mcp
test -x node_modules/.bin/supabase
test -x apps/web/node_modules/.bin/shadcn

pnpm exec typescript-language-server --version
pnpm exec supabase --version

# 使用 Repomix 產出三份固定用途的分析 context。
npx --yes repomix --version
mkdir -p .repomix
npx --yes repomix --config repomix.overview.config.json
npx --yes repomix --config repomix.docs.config.json
npx --yes repomix --config repomix.source.config.json
npx --yes repomix --config repomix.json.config.json
npx --yes repomix --config repomix.sql.config.json

for output in \
  .repomix/01-repository-overview.xml \
  .repomix/02-docs-full.xml \
  .repomix/03-source-context.xml \
  .repomix/04-json-context.json \
  .repomix/05-sql-context.sql
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

# MCP subprocess 使用相同的 Serena_HOME。
codex mcp add \
  serena \
  -- env \
  "SERENA_HOME=$SERENA_HOME" \
  "$SERENA_EXECUTABLE" \
  start-mcp-server \
  --project /workspace/Line_Bot_v1 \
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
