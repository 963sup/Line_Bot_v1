# Assistant package constraints

Local constraints for `@line_bot_v1/assistant`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Assistant is an orchestration consumer; it acquires no business domain authority.
- Tool invocations must pass through target domain public contracts and re-check caller authorization.
- LLM outputs are untrusted until validated against domain schemas.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
