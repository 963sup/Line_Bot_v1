# Codex command-safety rules

**Layer coverage:** L4 Capabilities/transports — command-safety adapter.

This directory is the command-pattern safety adapter of `.codex/`. A `.rules` file can classify a shell command as automatically allowed or requiring a prompt. It cannot grant product authorization, provider credentials, deployment approval, or permission to alter data.

## Function, use, and non-goals

Use this directory only when a repeated shell command pattern needs a durable,
least-privilege approval classification. It does not configure MCP tools,
authorize file edits, store deployment credentials, or replace the product's
external-effect contracts.

## Rule catalog

| File | Title / function | Used by | Effect boundary |
| --- | --- | --- | --- |
| [ast-grep.rules](ast-grep.rules) | AST code analysis | ast-grep (`sg`) commands | Allows bounded analysis; rewrites remain outside the allow boundary. |
| [default.rules](default.rules) | GCP safety defaults | Any direct GCP CLI use | Prompts for durable infrastructure, key, secret, or deployment effects. |
| [actionlint.rules](actionlint.rules) | GitHub Actions workflow validation | actionlint commands | Allows local workflow validation only. |
| [biome.rules](biome.rules) | JavaScript/TypeScript formatting and linting | Biome commands | Allows read-only checks; prompts for write mode. |
| [docker.rules](docker.rules) | Container diagnostics and lifecycle | Docker commands | Allows inspection; prompts for container, image, volume, or network mutation. |
| [gh.rules](gh.rules) | GitHub CLI safety | GitHub CLI tasks | Separates bounded reads from issue, PR, release, and workflow mutations. |
| [gitleaks.rules](gitleaks.rules) | Local secret scanning | gitleaks commands | Allows version and redacted scans; prompts for unredacted scans. |
| [git.rules](git.rules) | Git history and worktree safety | Local Git lifecycle | Separates inspection/recoverable operations from remote pushes and destructive history/file actions. |
| [knip.rules](knip.rules) | Unused code and dependency analysis | Knip commands | Allows local analysis. |
| [node.rules](node.rules) | Node.js local execution | Node version and test commands | Allows bounded version checks and local test execution. |
| [npm.rules](npm.rules) | npm compatibility boundary | npm commands | Allows version checks; prompts for dependency and publication operations because the repository uses pnpm. |
| [pnpm.rules](pnpm.rules) | Local package command safety | Package manager tasks | Allows ordinary local execution/validation; prompts for publication. |
| [playwright.rules](playwright.rules) | Browser test execution | Playwright commands | Allows repository tests; prompts for browser downloads and interactive generation. |
| [python.rules](python.rules) | Python runtime and tests | Python commands | Allows version checks and pytest; prompts for package installation. |
| [rg.rules](rg.rules) | Read-only source search | ripgrep commands | Allows local search without filesystem mutation. |
| [supabase.rules](supabase.rules) | Supabase CLI safety | Schema inspection tasks | Allows inspection/diff/lint; prompts for database reset. |
| [tsc.rules](tsc.rules) | TypeScript compilation | `tsc` commands | Allows no-emit checks; prompts for artifact-producing compilation. |
| [tsx.rules](tsx.rules) | TypeScript runtime and tests | `tsx` commands | Allows bounded local test execution. |
| [turbo.rules](turbo.rules) | Monorepo task orchestration | Turbo commands | Allows repository-defined `turbo run` tasks. |
| [uv.rules](uv.rules) | Python environment and task execution | uv commands | Allows scoped `uv run`; prompts for dependency and tool installation. |
| [vercel.rules](vercel.rules) | Vercel CLI safety | Deployment diagnosis tasks | Allows bounded inspection; prompts for deploy, production, and deletion. |

## Design and validation

`allow` is for a bounded ordinary local or read-only operation; `prompt` is for an external, destructive, credential, or broad-state effect. The default never replaces review of the task's exact target and authorization. Rules use stable prefixes plus `match` and `not_match` examples; prefer a new narrow rule over expanding a broad one.

Read [AGENTS.md](AGENTS.md) before editing. Run `pnpm tooling:rules` and `pnpm tooling:check`; also run `pnpm docs:check` when Markdown links change. These checks prove static rule semantics only.

## Long-term approval policy

For an approval-oriented Codex session, the goal is not to eliminate every prompt. The goal is to make prompts represent a meaningful boundary rather than routine development noise.

| Category | Rule decision | Examples |
| --- | --- | --- |
| Deterministic local inspection and validation | `allow` | `git status`, `rg`, project-defined tests, static checks |
| Recoverable local authoring | `allow` only when the pattern is narrow and has no external write | formatting or a deliberate local commit path |
| Remote readback | `allow` only for a bounded provider read command | GitHub/Vercel/Supabase inspection |
| External, destructive, durable, credential, publish, deploy, or broad filesystem action | `prompt` | push, release, deploy, publish, reset, delete, database reset, secret/key creation |

File-edit confirmation comes from the host sandbox/approval policy, not these rules. The repository reduces repeated semantic confirmation through explicit task scope and a single writer, but it must never claim that a rule suppresses a host prompt.

## Naming and admission rule

Use `<provider-or-mechanism>.rules`, in lowercase kebab case. Add a file only
when its commands share a stable safety boundary that cannot be expressed in an
existing file. A new provider integration still needs its own repository
contract; a command rule is only the local approval adapter.
