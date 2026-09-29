# Repository scripts scope

Root `package.json#scripts` is the shared public command surface; `scripts/` implements repository operations. Each command has one observable result, real consumer and side-effect boundary. Product rules and persistence authority remain with their existing owners.

## Governing files

本 scope 修改前仍必須遵守 root `AGENTS.md#Mandatory governing set`，尤其是以下 current authority / guard：

`architecture/README.md` · `architecture/data-topology.json` · `architecture/implementation-topology.json` · `architecture/domain/fpt/*.json` + `architecture/domain/fpt-source.json` · `architecture/semantic-model.json` · `.dependency-cruiser.mjs` · `biome.json` · `knip.jsonc`

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。

## Ownership

Before adding or moving code, identify its consumer, command, owner, source of truth and failure/recovery boundary. Reuse existing capabilities. Do not create generic wrappers, managers or abstractions to shorten YAML or reduce file counts.

Group code by independent operation responsibility; colocate tests. Share mechanisms only when real consumers need them. CLI argv/env/output adapters do not become business owners.

## Workflow contract

GitHub workflows invoke commands and own GitHub setup/routing/secrets/artifacts. Scripts own testable source classification and complete provider operations. Source changes trigger only the corresponding operation; no unconditional remote repair or unrelated-provider dependency.

Supabase schema publication consumes `supabase/schemas/*.sql`, applies the declared remote diff without migration history, and verifies the result. Rich Menu publication consumes its images/code and publishes once. Historical compatibility/data conversions are not part of either normal publication path.

## Safety / validation

- Read-only commands do not mutate remote state. Mutation names and inputs express authorization and exact targets.
- Preserve locks, transactions, bounded failures and post-write readback. Do not invent business metadata or touch provider-owned schemas.
- General check/validate stays secret-free and does not probe or mutate production.
- Generated evidence is reproducible and transient; it is not business authority or migration history.
- Preserve existing user changes. Update affected package commands, workflows, documentation and tests together.
- Run affected tests, `pnpm check` and documentation checks; release/merge requires `pnpm validate`. Report local and external evidence separately.
