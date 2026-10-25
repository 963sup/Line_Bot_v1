# Codex command-safety rules

This directory is the command-pattern safety adapter of `.codex/`. A `.rules` file can classify a shell command as automatically allowed or requiring a prompt. It cannot grant product authorization, provider credentials, deployment approval, or permission to alter data.

## Rule catalog

| File | Boundary |
| --- | --- |
| [default.rules](default.rules) | GCP commands with potentially durable infrastructure, key, secret, or deployment effects. |
| [gh.rules](gh.rules) | GitHub CLI reads versus issue, PR, release, and workflow mutations. |
| [git.rules](git.rules) | Local inspection, recoverable worktree operations, remote pushes, and destructive history/file operations. |
| [pnpm.rules](pnpm.rules) | Local package execution and validation versus package publication. |
| [supabase.rules](supabase.rules) | Read/diff/lint operations versus database reset. |
| [vercel.rules](vercel.rules) | Deployment inspection versus preview, production, and deletion effects. |

## Design and validation

`allow` is for a bounded ordinary local or read-only operation; `prompt` is for an external, destructive, credential, or broad-state effect. The default never replaces review of the task's exact target and authorization. Rules use stable prefixes plus `match` and `not_match` examples; prefer a new narrow rule over expanding a broad one.

Read [AGENTS.md](AGENTS.md) before editing. Run `pnpm tooling:rules` and `pnpm tooling:check`; also run `pnpm docs:check` when Markdown links change. These checks prove static rule semantics only.
