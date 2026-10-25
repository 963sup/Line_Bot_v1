# EME Engineering Commands

- Daily web development: `pnpm dev`. Production compilation: `pnpm build`. Start the web app: `pnpm start`.
- Scope a cross-owner change: `pnpm semantic plan <intent>`; request exact authority selectors with `pnpm semantic context <intent>`.
- Use `pnpm code definition` or `references` for exact TypeScript symbol navigation; use `rg` for exact text and known files.
- Diagnostics: `pnpm tooling:doctor`; add `--mcp` only when live local MCP transport must be checked.
- On Windows use PowerShell-native commands; do not depend on Unix shell syntax in task instructions.
