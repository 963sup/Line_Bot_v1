# Source operation tool

`pnpm code` provides repository-scoped structural search and TypeScript navigation. Reads never modify source files. Rewrite and rename can only write a version 1 declarative plan below `.artifacts/`; `pnpm patch:apply <plan.json> [--apply]` remains the sole source mutation boundary.

| File | Responsibility |
| --- | --- |
| `cli.mjs` | Parses the five public operations and emits JSON results. |
| `core.mjs` | Owns Git inventory, ast-grep execution, TypeScript LanguageService queries, conservative rename classification, plan construction and output confinement. |
| `cli.test.mjs` | Exercises real ast-grep search/rewrite, patch dry-run/apply, TypeScript project behavior and safety boundaries in temporary Git repositories below `.artifacts`. |

## Commands

```sh
pnpm code --help
pnpm code search --rule .artifacts/example-rule.yml --scope packages/example --exclude packages/example/dist
pnpm code rewrite --rule .artifacts/example-rule.yml --scope packages/example --objective "replace deprecated call" --out .artifacts/example-plan.json
pnpm code definition packages/example/src/file.ts 12 8
pnpm code references packages/example/src/file.ts 12 8
pnpm code rename packages/example/src/file.ts 12 8 newName --objective "rename local symbol" --out .artifacts/rename-plan.json
```

`--scope` and `--exclude` may repeat. Search/rewrite inventory is the union of tracked files and non-ignored untracked files. It includes eligible hidden JS-family source in `.github` and `.codex`, while excluding environment/credential-like files, dependencies, build/generated output, `.artifacts`, vendored skills and vendored GitHub FPT truth. Supported source extensions are `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` and `.cts`. Coverage reports candidate files, files analyzed for the native rule language, and language exclusions separately.

Keep task rules and plans in ignored `.artifacts`. For example, `.artifacts/example-rule.yml` can use ast-grep's native YAML schema:

```yaml
id: replace-deprecated-call
language: TypeScript
rule:
  pattern: deprecatedCall($ARG)
fix: replacementCall($ARG)
severity: error
```

The complete reviewable flow is:

```sh
pnpm code search --rule .artifacts/example-rule.yml --scope packages/example
pnpm code rewrite --rule .artifacts/example-rule.yml --scope packages/example --objective "replace deprecated call" --out .artifacts/example-plan.json
pnpm patch:apply .artifacts/example-plan.json
pnpm patch:apply .artifacts/example-plan.json --apply
pnpm code search --rule .artifacts/example-rule.yml --scope packages/example
```

A rewrite rule must supply a native `fix`; the tool consumes ast-grep's JSON `replacement` and UTF-8 byte `replacementOffsets`. Version 1 accepts the native languages `JavaScript` (including `.jsx`), `TypeScript` and `Tsx`; rule-level `files`/`ignores` filters, including YAML merges, are rejected because `--scope`/`--exclude` own auditable file selection. The wrapper does not perform meta-variable substitution and never passes update-all or interactive flags.

Reported locations use 1-based UTF-16 line and column coordinates. ast-grep byte offsets are converted against the exact UTF-8 source bytes before output.

Definition, references and rename select the nearest containing `tsconfig.test.json`, falling back to the nearest containing `tsconfig.json`, and preserve its effective compiler options. A file without a containing configuration returns `unsupported`. Output always identifies the selected project and states that reference coverage is project-scoped rather than repository-global.

Automatic rename plans are limited to confidently private, project-local symbols. Exports, imports/aliases, ambient or nonmodule globals, declaration or dist boundaries, cross-project locations, unresolved imports and unclassified symbols return a partial preview with `applicable: false`; no plan is written. TypeScript-provided prefix/suffix edits preserve shorthand public keys. An in-memory LanguageService rejects new diagnostics or references captured by different symbols. Comments and general strings are not renamed.

Every plan contains one full-file `before`/`after` change per affected file, the original SHA-256, and the caller's objective. Structural rewrites recheck every inventoried candidate after scanning, including unmatched files; TypeScript operations bind plans to their LanguageService snapshots. The existing patch preflight validates the completed plan before it is created exclusively. An existing output is never overwritten. Syntax-invalid, semantically unsafe, overlapping, stale, non-UTF-8 or symlink-traversing changes fail closed.
