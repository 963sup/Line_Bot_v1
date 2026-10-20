# Source operation tool

`pnpm code` provides repository-scoped structural search and TypeScript navigation. Reads never modify source files. Rewrite and rename can only write a version 1 declarative plan below `.artifacts/`; `pnpm patch:apply <plan.json> [--apply]` remains the sole source mutation boundary.

| File | Responsibility |
| --- | --- |
| `cli.mjs` | Parses the six public operations and emits JSON results. |
| `core.mjs` | Owns Git inventory, ast-grep execution, TypeScript LanguageService queries, conservative rename classification, plan construction and output confinement. |
| `cli.test.mjs` | Exercises real ast-grep search/rewrite, patch dry-run/apply, TypeScript project behavior and safety boundaries in temporary Git repositories below `.artifacts`. |
| `facts.mjs` | Builds read-only in-memory ts-morph syntax facts and bounded TypeScript module-resolution evidence from working-tree snapshots. |
| `facts.test.mjs` | Covers syntax forms, resolution boundaries, manifests, exclusions and drift guards in temporary Git repositories. |

## Commands

```sh
pnpm code --help
pnpm code facts --scope packages/example --exclude packages/example/generated
pnpm code search --rule .artifacts/example-rule.yml --scope packages/example --exclude packages/example/dist
pnpm code rewrite --rule .artifacts/example-rule.yml --scope packages/example --objective "replace deprecated call" --out .artifacts/example-plan.json
pnpm code definition packages/example/src/file.ts 12 8
pnpm code references packages/example/src/file.ts 12 8
pnpm code rename packages/example/src/file.ts 12 8 newName --objective "rename local symbol" --out .artifacts/rename-plan.json
```

`--scope` and `--exclude` may repeat. Search/rewrite inventory is the union of tracked files and non-ignored untracked files. It includes eligible hidden JS-family source in `.github` and `.codex`, while excluding environment/credential-like files, dependencies, build/generated output, `.artifacts`, vendored skills and vendored GitHub FPT truth. Supported source extensions are `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts` and `.cts`. Coverage reports candidate files, files analyzed for the native rule language, and language exclusions separately.

## Code facts

`facts` prints deterministic JSON to stdout and never accepts `--out`, saves source, or creates an index/cache/plan. It parses captured source text in an in-memory ts-morph project without loading a tsconfig project, libraries, target ASTs or a type checker. Facts cover static ESM bindings, local named exports, named/star/namespace reexports, direct top-level syntactic declarations, syntax diagnostics and unsupported dynamic `import()`/`require()` occurrences. Declaration facts expose names, locations, explicit `export`/`default`/`declare` modifiers and booleans such as `hasInitializer`/`hasExplicitType`/`signatureOnly`; later export statements remain separate syntax facts. They never serialize bodies, initializer values, inferred types or literal type text.

Static string specifiers use root TypeScript and the actual nearest containing `tsconfig.test.json`, falling back to `tsconfig.json`; no config returns `not-attempted-no-config`. Node16/NodeNext and import-attribute condition selection are explicitly partial in this MVP rather than guessed. Import-type expressions and import-equals declarations are reported as unsupported occurrences. Resolution categories describe static targets (`local`, `declaration`, `dist/generated`, `cross-project`, `out-of-scope`, `external/builtin`, `external`); they do not assert runtime loading, package authorization, public API status, merged symbol identity or repository-global completeness.

The result reports ts-morph's parser TypeScript version separately from the root resolver TypeScript version, working-tree provenance, source hashes, script kinds, consulted config inputs and nearest source/target package manifests. Raw `package.json#exports` mappings preserve their declared condition order. Metadata is decoded from the same UTF-8 bytes that are hashed; UTF-8 BOMs are accepted. Before stdout, the command rechecks HEAD, scoped Git inventory, captured source/config/manifest/eligible target bytes, and positive/negative resolution and realpath probes. Source inventory rejects every symlink. Metadata resolution permits dependency links only below `node_modules` when every existing ancestor and final realpath remain inside the repository; workspace and pnpm-store targets remain facts, not authorization. Link retargeting, non-UTF-8, credential-like and outside-root inputs fail closed or appear as explicit exclusions/issues.

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
