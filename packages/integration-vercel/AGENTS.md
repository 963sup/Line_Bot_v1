# integration-vercel constraints

Parent rules: [packages/AGENTS.md](../AGENTS.md).

- External SDK and platform credentials stay in this integration package.
- The application host composes providers with owning modules' public Ports.
- Business writes and authority remain in the owning modules.
- Public imports use only package.json exports; no private deep imports.
