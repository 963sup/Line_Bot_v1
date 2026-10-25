# Effective capability routing contract

**Layer owner:** L4 Capabilities/transports. This is a routing contract, not a
second source of executable configuration, product authority, or permission.

## First-principles purpose

A capability is useful only when it converts one identified missing fact into a
bounded result that a role needs. Its installation, plugin origin, or approval
metadata has no value by itself. Therefore a route must answer all of these
questions before it is selected:

1. What unresolved question or evidence gap does it close?
2. Which one role consumes its result?
3. Which authoritative declaration proves the capability is configured?
4. What preflight establishes that it is available for this task now?
5. What result can it prove, and what must it never be used to claim?
6. What is the smallest fallback if the preflight fails?

The command, MCP, Skill, role profile, and repository contract retain their
own authority. This document only owns the choice relationship between them.

## Capability state model

Do not collapse the following states into a claim that a capability "works":

| State | Meaning | Evidence owner |
| --- | --- | --- |
| Declared | The command, MCP, or Skill is named by its authoritative configuration. | `package.json`, `config.toml`, or installed Skill metadata |
| Eligible | A role has a task whose bounded question matches this route. | Primary task packet and role profile |
| Available | Current-session prerequisites, target identity, and required local/runtime connection have been checked. | Assigned role |
| Executed | The route ran against the stated target and revision. | Assigned executor / `validation-runner` |
| Proven | Its result supports exactly the declared evidence claim. | `validation-runner` or `decider` |

Failure at any state returns to the smallest earlier owner. A configured MCP
that is not connected, a Skill whose prerequisites do not fit, or a command
whose target is unknown is a capability gap—not permission to substitute a
broader tool.

## Selection protocol

This protocol is an active routing instruction for Primary and every assigned
role, not background documentation. The project configuration and
`agents/AGENTS.md` require it whenever L4 capability selection is needed.

1. Primary first resolves the task's Owner, contract, consumer, and evidence
   claim. A known single-owner task does not need capability ceremony.
2. If one fact remains unresolved, choose the route below with the narrowest
   effect boundary. Do not select by tool popularity or by installed inventory.
3. The selected role performs the stated preflight. On failure, report the
   gap and use only the listed fallback; it does not install, reconnect, or
   change transport without a separately authorized task.
4. The role returns the route ID, reached state (`Declared`, `Eligible`,
   `Available`, `Executed`, or `Proven`), target/revision, bounded output, and
   what its result does not prove in its L5 handoff.
5. L6 assesses the result with the correct evidence owner. Provider, browser,
   deployment, and device evidence stay separate even when one task uses more
   than one route.

## Routable capabilities

| Route ID | Actual capability and authority | Consumer role | Use only when | Required preflight | Bounded result / does not prove | Prohibited / fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `semantic-scope` | `pnpm semantic plan` / `context`; [`package.json`](../package.json) | Primary; `investigator` only after semantic resolution remains insufficient | Owner, contract, consumer, or cross-owner impact is unknown | Intent names a concrete outcome; `plan` precedes `context` only when exact selectors are needed | Candidate authority selectors and scoped retrieval inputs; not mutation authority or complete runtime behavior | Do not use it for known single-owner work; fallback to owner contract and targeted source/tests |
| `static-navigation` | `pnpm code facts`, `definition`, `references`; [`package.json`](../package.json) | `investigator` | A bounded symbol/import/export path remains needed after semantic scope is known | Explicit path/symbol and scope; inspect partial/boundary report | Source-snapshot links and location evidence; not business ownership, runtime calls, or global completeness | Do not treat derived facts as domain truth; fallback to targeted `rg` and source reading |
| `change-application` | `pnpm code rewrite` / `rename` preview and `pnpm patch:apply`; [`package.json`](../package.json) | `change-implementer` | A repeated, decided source change has a safe generated plan | Owner, public-consumer scope, representative hit/exclusion, and plan/hash preflight | Checked local change application; not cross-project migration or acceptance | Never bypass plan/hash checks; fallback to direct minimal edit for a small non-repetitive change |
| `bounded-validation` | `pnpm validation:run --label …`; [`package.json`](../package.json) | `validation-runner` | Task packet gives commands, target, expected effect, and evidence owner | Exact revision/WIP and allowed command set | Exit code, duration, bounded failure output, ignored full-log artifact; not design, provider readback, or acceptance | Do not run unassigned/broad commands; fallback to report missing validation plan |
| `static-contract-check` | `pnpm docs:check`, `tooling:check`, `tooling:rules`, `schema:check`; [`package.json`](../package.json) | `change-implementer` / `validation-runner` / schema owner | The corresponding docs, Codex policy, or declarative schema changed | Changed-owner selection and relevant local prerequisites | Static contract evidence for the named input; not session reload, remote schema state, or product behavior | Do not use a green unrelated check; fallback to the selected owner-level test or report unavailable prerequisite |
| `synthetic-browser-flow` | `pnpm test:browser`; [`package.json`](../package.json) | `validation-runner` | A defined loopback browser flow needs trace/screenshot evidence | Existing local browser script, route/fixture, and stable flow label | Synthetic visual/trace evidence; not provider login, backend persistence, or device acceptance | No real provider/device flow; fallback to report absent local flow/fixture |
| `serena-symbol-exploration` | Serena MCP; [`.codex/config.toml`](config.toml) | `investigator` | Static navigation cannot answer a bounded stateful symbol question | Current worktree identity and available read-only tools | Read-only bounded symbol exploration; not a role, product truth, or mutation | Do not use before semantic scope or install/switch transport; fallback to `pnpm code` + `rg` |
| `next-runtime-observation` | Next DevTools MCP; [`.codex/config.toml`](config.toml) | `runtime-diagnostician` | A local Next.js runtime symptom has an explicit running port | Loopback endpoint, current `apps/web` checkout, and live tool schema | Observed runtime condition / version documentation; not browser acceptance or source correctness | Do not start/restart server or query an unverified port; fallback to source/installed docs and state runtime gap |
| `shadcn-registry-research` | shadcn MCP; [`.codex/config.toml`](config.toml) | `investigator` | Registry/component compatibility is unresolved | Existing UI owner, `components.json`, current primitives, and live tool schema | Compatible registry option and expected dependencies; not installation authorization | Do not run generated commands or alter registry; fallback to existing shared UI components |
| `sentry-incident-observation` | Sentry MCP; [`.codex/config.toml`](config.toml) | `runtime-diagnostician` | A specific read-only incident, project, environment, and time/release window are supplied | Target identity, available read-only tool, privacy boundary, source-map/release context when needed | Exception/release/timeline correlation; not root cause, business truth, or acceptance | No telemetry/provider writes; fallback to repository evidence plus explicit observability gap |
| `supabase-design-guidance` | `supabase` + `supabase-postgres-best-practices` Skills; [installed skill index](../.agents/skills/) | `analyst` | A bounded PostgreSQL/Supabase design or transition needs current provider guidance | Current schema/data topology and an already-known product policy/owner | Read-only relation/RLS/index/recovery design input; not remote schema/data operation | No migration-history recovery or remote CLI use; fallback to repository schema/topology with stated documentation gap |
| `actions-security-guidance` | `agentic-actions-auditor` + `github-actions` Skills; [installed skill index](../.agents/skills/) | `reviewer` | A workflow trust boundary is under review | Exact workflow diff/trigger/permission and bounded local references | Read-only trust-path analysis; not CI execution, secret access, or workflow edits | Do not download/execute external actions; fallback to direct local YAML/dataflow review |
| `dependency-risk-guidance` | `supply-chain-risk-auditor` Skill; [installed skill index](../.agents/skills/) | `reviewer` | An exact manifest/lockfile candidate needs current risk evidence | Manifest + lockfile + declared consumer + supported runtime path | Read-only provenance/advisory/reachability analysis; not install safety or runtime exploitability | No install/audit/build; fallback to local manifest/lockfile inspection and state advisory gap |

## Plugin rule

Plugins are distribution containers, not independently useful runtime routes.
They must not receive a row merely because they are installed. If a plugin
provides a Skill, MCP, or app that meets this contract, record the concrete
consumed capability above and reference its authoritative configuration. If its
last consuming route is removed, remove the reference as well.

## Change and evidence rule

Add or alter a route only when all seven fields in the table are evidenced by a
real consumer. Update the owning command/config/profile first, then this index
and the relevant role profile. Validate `.codex` changes with `pnpm
tooling:check` and Markdown links with `pnpm docs:check`; run `pnpm
tooling:rules` only when a `.rules` file changes. Static validation proves the
index references current local configuration, not a live session connection.
