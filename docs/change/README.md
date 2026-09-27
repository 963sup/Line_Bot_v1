# Governance

Governance only stores change-over-time knowledge that still affects a future decision, cutover, open gap, active risk, or reproducible acceptance/recovery decision. It is never a second source of current product or architecture truth.

- `decisions/`: selected rationale or target direction that still has future decision value.
- `proposals/`: proposals not yet promoted to current truth and still backed by a real consumer or activation question.
- `migrations/`: cutovers that still need execution or verification.
- `gaps/`: incomplete work with an explicit completion condition.
- `risks/`: active risks.
- `evidence/`: dated/revision-scoped evidence that still supports recovery, regression, or release decisions.

Raw historical logs, retired baselines, completed migrations without recovery value, and speculative targets without a consumer do not stay in the current tree. Use Git history when raw history is needed; do not create a second history knowledge surface.

When a migration or proposal becomes current, move the durable truth to its real owner: `docs/facts/`, `docs/rules/`, `docs/owners/`, source/tests, architecture manifests, or schema. Delete the obsolete change artifact when it no longer has decision/recovery value.

Acceptance evidence proves only its recorded revision/environment/scope. It never proves current provider, deployment, device, or business state by itself.
