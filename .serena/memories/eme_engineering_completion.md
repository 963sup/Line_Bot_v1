# EME Engineering Completion

- Select validation by changed owner: documentation and configuration changes use the applicable `pnpm check` stages, especially `check:repository` and `lint`; source changes use the affected `pnpm check` stages; explicit full audit or merge/release uses `pnpm validate` when available.
- AGENTS, MCP, or configuration changes require the applicable canonical checks plus `pnpm check:repository`; this repository has no dedicated `pnpm docs:check` script.
- A passing static check proves only its own boundary. Keep provider, deployment, schema, browser, and device evidence separate.
- Before PR/main, verify the exact head and relevant consumers; preserve existing WIP and do not claim unexecuted validation.
