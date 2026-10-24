# Repository instruction routing

Before changing any source or governance contract, read the current root [AGENTS.md](../AGENTS.md) and the nearest applicable scoped `AGENTS.md`. They are authoritative for root-cause analysis, ownership, high cohesion / low coupling, minimum sufficient DDD + Hexagonal implementation, protected invariants and validation. This file is only a Copilot entrypoint, **not** a second policy.

Locate task and owner via [task routing](../docs/README.md), the matching `docs/tasks/` contract and current source / schema / tests / public exports. For Issue → PR → Merge → Release → Acceptance → Regression, follow the [canonical change lifecycle](../docs/reference/engineering/development-workflow.md#issue-pr-and-acceptance-trace) and [PR evidence interface](pull_request_template.md).

Do not substitute Issue/PR prose, old analysis, a shorter diff or a passing CI result for current repository truth and the required acceptance evidence. When a correctness- or authorization-affecting Owner / Contract / Source of Truth remains unresolved, report the gap instead of guessing.
