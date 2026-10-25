# EME Engineering Completion

- Select validation by changed owner: docs changes use `pnpm docs:check`; source changes use `pnpm check`; explicit full audit or merge/release uses `pnpm validate`.
- Tooling, AGENTS, MCP, or configuration changes require `pnpm tooling:check` plus `pnpm docs:check`. Rules changes also require `pnpm tooling:rules`.
- A passing static check proves only its own boundary. Keep provider, deployment, schema, browser, and device evidence separate.
- Before PR/main, verify the exact head and relevant consumers; preserve existing WIP and do not claim unexecuted validation.
