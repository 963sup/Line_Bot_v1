# EME Engineering Completion

- Select validation by changed owner: docs changes use `pnpm docs:check`; source changes use `pnpm check`; explicit full audit or merge/release uses `pnpm validate`.
- AGENTS, MCP, or configuration changes require the applicable canonical checks plus `pnpm docs:check`.
- A passing static check proves only its own boundary. Keep provider, deployment, schema, browser, and device evidence separate.
- Before PR/main, verify the exact head and relevant consumers; preserve existing WIP and do not claim unexecuted validation.
