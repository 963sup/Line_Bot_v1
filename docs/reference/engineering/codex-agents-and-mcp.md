# Codex routing: agents and MCP

Machine routing only. Do not treat this file as a second configuration source.

## Sources

- Agent registry/config: [`.codex/config.toml`](../../../.codex/config.toml)
- Agent instructions: [`.codex/agents/`](../../../.codex/agents/)
- Global constraints: [`AGENTS.md`](../../../AGENTS.md)
- Serena v2/LSP operation: [`.serena/README.md`](../../../.serena/README.md)

## Selection algorithm

Cloud tools are registered by the active host. Project-local config and standalone
agent files configure compatible local Codex hosts; their presence does not prove
Cloud loaded them. Repository command hooks require a supported local host and
trust; execute preflight and checks explicitly in Cloud. See the official
[configuration reference](https://developers.openai.com/codex/config-reference),
[custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents), and
[hooks support](https://learn.chatgpt.com/docs/hooks).

```text
1. Read root AGENTS.md and nearest scope AGENTS.md.
2. Identify owner, contract, consumer, and evidence boundary.
3. Select exactly one primary role from the index below.
4. Use Serena v2 + LSP first for TS/JS symbols, references, diagnostics, and refactors.
5. Load only MCPs required by the selected role and task.
6. Use hosted MCPs read-only unless the task explicitly authorizes a target write.
7. Report unavailable handshake, OAuth, token, or provider evidence as unverified.
```

## Role index

| Trigger | Primary role | Config |
| --- | --- | --- |
| MCP registration, host refresh, authentication/runtime diagnosis | mcp-maintainer | `.codex/agents/mcp-maintainer.toml` |
| substantial requirements, scope, acceptance planning | requirement-architect | `.codex/agents/requirement-architect.toml` |
| architecture, boundaries, dependency direction | architect | `.codex/agents/architect.toml` |
| runtime/test/build failure | debugger | `.codex/agents/debugger.toml` |
| cross-service/provider acceptance | integration-validator | `.codex/agents/integration-validator.toml` |
| code correctness/regression review | reviewer | `.codex/agents/reviewer.toml` |
| auth/secrets/RLS/security | security-auditor | `.codex/agents/security-auditor.toml` |
| test gap/regression design | test-engineer | `.codex/agents/test-engineer.toml` |
| CI/branch protection/merge evidence | release-gatekeeper | `.codex/agents/release-gatekeeper.toml` |
| SQL/schema/RLS/migration/rollback | database-steward | `.codex/agents/database-steward.toml` |
| Sentry/Vercel/trace/production evidence | observability-investigator | `.codex/agents/observability-investigator.toml` |
| latency/token/query/bundle/provider cost | performance-cost-analyst | `.codex/agents/performance-cost-analyst.toml` |
| UI accessibility/keyboard/form/error flow | accessibility-ux-auditor | `.codex/agents/accessibility-ux-auditor.toml` |
| README/AGENTS/Serena/memory routing | documentation-curator | `.codex/agents/documentation-curator.toml` |
| public API/HTTP/event/provider/package contract | contract-steward | `.codex/agents/contract-steward.toml` |
| complete browser/service journey | e2e-journey-engineer | `.codex/agents/e2e-journey-engineer.toml` |
| dependency/lockfile/toolchain/supply chain | dependency-steward | `.codex/agents/dependency-steward.toml` |
| rollout/flag/backfill/deprecation/rollback plan | lifecycle-owner | `.codex/agents/lifecycle-owner.toml` |
| extraction/provenance/completeness/data consistency | data-quality-analyst | `.codex/agents/data-quality-analyst.toml` |

## MCP routing

| MCP | Use only for | Evidence rule |
| --- | --- | --- |
| `serena` | TS/JS symbols, LSP, references, diagnostics, semantic edits | v2 + LSP first; call `initial_instructions` once/session |
| `github` | PR, checks, repository, issue readback | hosted handshake/token must be verified |
| `context7` | current library/framework docs | `CONTEXT7_API_KEY` may be absent; report unavailable |
| `openaiDeveloperDocs` | OpenAI official docs | read-only host handshake required |
| `next-devtools` | local Next runtime diagnostics | use only with the target dev server |
| `shadcn` | local component registry/tooling | use only for UI component tasks |
| `sentry` | read-only event/error evidence | OAuth and host handshake required |

## Fresh Cloud MCP registration

Use Cloud installation and startup settings. Register through the official Codex CLI; verify native tools and OAuth separately.

## Validation

`codex:config` checks every registered role and instruction-chain budgets for
repository work directories. Vendored `.agents/skills/` guidance is loaded as
skill content rather than used as a project working directory.

The instruction budget remains the default 32 KiB, with a separate root budget
to preserve space for nested guidance. All tracked project instruction chains
are measured; raising the host limit is not an accepted fix for growth.

```sh
pnpm check codex:config
pnpm check hooks
serena memories check
```
