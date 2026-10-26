# EME Engineering Toolchain

- ESM TypeScript workspace. Node 24.x; pnpm 11.25.0 with engineStrict and exact dependency saving.
- Turbo coordinates `apps/*` and `packages/*`; web uses Next 16.3.4 and React 19.2.8.
- Biome 2.5.14 is the formatter/lint authority; dependency-cruiser enforces implementation topology; Knip enforces reachability.
- Serena runs with the TypeScript LSP backend and the project-local REPL interface; symbol navigation, bounded diagnostics, language-server recovery, structure-aware symbol editing, and reference-aware safe deletion are available through `serena_repl`.
