# Codex runtime scope

**Layer scope:** L2 Orchestration and L4 Capabilities/transports.

Read [README.md](README.md) for the six-layer design and directory map. This file
contains only the runtime constraints that apply to every child.

- `.codex/` owns Codex runtime configuration, role profiles, command-safety policy, and support launchers. It never owns product/business/repository truth.
- Keep the separation: `config.toml` configures transport; `agents/` owns roles and handoffs; `rules/` owns command-pattern safety; `scripts/` owns runtime support only.
- For a six-layer design, role, workflow, handoff, atomic-instruction, validation, or interchange-format change, read the matching document in [README.md](README.md) before editing; keep its Owner unique and link, rather than copy, adjacent layer rules.
- When a task needs L4 capability selection rather than a known direct path, read [CAPABILITIES.md](CAPABILITIES.md) and select only its matching route; do not infer a route from installed-tool inventory.
- Root plus nearest `AGENTS.md` always apply. Role files cannot override parent sandbox, approval, provider authorization, or repository governance.
- `rules/*.rules` only classify shell commands. They do not authorize provider writes, deployment, data handling, or a change of product scope.
- Do not broaden sandbox, approval, MCP, or command prefixes merely to pass a task. Preserve least privilege and report an unavailable capability instead.
- Validate changes under this tree with `pnpm tooling:check`; validate rule semantics with `pnpm tooling:rules`; validate Markdown links with `pnpm docs:check`. Static checks do not prove a running session reloaded configuration.

## External CLI runtime

- The Codex runner owns process-level configuration for authenticated external CLIs such as GitHub CLI and Vercel CLI.
- The baseline runner capabilities are Git, GitHub CLI, Vercel CLI, Node.js, pnpm, ripgrep, actionlint, and gitleaks; availability is runtime state, not repository-owned installation metadata.
- Repository instructions and scripts may require these capabilities, but must not hard-code runner-specific absolute paths or assign credential-related environment variables.
- Repository tooling may read the current process environment and perform bounded, read-only availability/authentication checks without printing tokens or credential contents.
- Credential stores, CLI paths, and authentication state remain outside repository source, commits, logs, and chat content.
- If the runner does not inject the required capability, report it as unavailable; do not create a repository-local credential or compatibility workaround.

## Codex integrations

- Prefer the enabled Serena, GitHub, Vercel, Context7, and Next DevTools integrations when their scoped capability is more precise than raw CLI output.
- Serena is the preferred route for symbol, reference, and dependency exploration; read its session instructions before coding work.
- GitHub and Vercel integrations remain subject to the same read/write authorization boundaries as their CLIs; connector availability does not authorize remote mutation.
- Context7 and Next DevTools are documentation/runtime evidence sources, not replacements for repository source of truth or validation.
- Do not assume a separate Playwright MCP is available. Use the repository-pinned Playwright capability or the enabled browser/Next DevTools route when browser verification is required.
- Integrations must return bounded, task-relevant evidence; do not preload complete PRs, deployments, logs, or documentation into context.

## Dispatch enforcement

- For cross-Owner work, architecture/public-contract decisions, independent review, runtime investigation, merge-conflict resolution, or validation/acceptance claims, Primary must dispatch an enabled Atomic to its derived executor profile before integrating a conclusion.
- The dispatch must use an L5 task packet and return a matching handoff result with `atomicId`, scope, revision, deliverable, stop condition, validation owner, and evidence boundary.
- Primary may work directly only on a bounded single-Owner read or reversible edit whose contract and consumer are already known. The runtime reminder is also configured in [`config.toml`](config.toml); this file is the repository-level contract and remains authoritative when a live session has not reloaded config.
