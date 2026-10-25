# Validation and acceptance

**Owner:** L6 evidence routing. **Audience:** Primary, validator, verifier, and acceptance decider. **Type:** Reference.

Validation asks whether a specific claim is supported at a specific revision and target. It never turns a check, deployment, or provider configuration into a broader claim.

## Evidence routing

| Claim | Evidence owner | Supporting evidence | Never proves |
| --- | --- | --- | --- |
| Markdown links/structure | `change-implementer` / `validation-runner` | `pnpm docs:check` | Product behavior/deployment |
| Source/contract/consumer correctness | Owner test + `validation-runner` | Selected `pnpm check` groups and tests | Provider/device state |
| Declarative schema | Schema owner + `validation-runner` | `pnpm schema:check` | Remote Supabase state |
| Synthetic web flow | `validation-runner` via `validate.synthetic-browser-flow` | Loopback screenshot, trace, browser script | Provider login, persistence, device acceptance |
| Runtime exception incident | `runtime-diagnostician` via `diagnose.sentry-incident` | Read-only issue/event/release/source-map observation | Root cause or business acceptance |
| Exact provider state | Assigned readback owner | Bounded API/provider readback | Unrelated business flow |
| Production deployment | Release/deployment owner | Exact SHA + provider readback | Browser/device acceptance |
| Physical/device flow | Explicit acceptance owner | Observed target environment | Source/schema/provider correctness |

## Acceptance protocol

1. Define the claim, candidate revision, target, and required evidence rows.
2. Use [evidence-plan.schema.json](schemas/evidence-plan.schema.json) when the plan must cross a role boundary.
3. `validation-runner` via `validate.evidence-claim` judges whether supplied evidence supports the claim; it does not create more evidence.
4. `decider` via `decide.acceptance` is used only for a high-risk decision with complete, independent evidence.
5. Return unsupported remainder through the L5 handoff to the earliest layer that owns the missing fact.

Repository [validation rules](../docs/rules/validation-evidence.md) remain the
proof-limit authority; this document owns the L6 routing explanation.
