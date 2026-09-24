# @line-work/workforce

`@line-work/workforce` is the registered Workforce workspace/module owner. The module boundary exists so Workforce responsibility has one explicit implementation owner; runtime capability is still target design.

- Canonical semantics: [Workforce](../../docs/010-domain-owners/040-workforce.md)
- Local change constraints: [AGENTS.md](AGENTS.md)
- Parent package rules: [../AGENTS.md](../AGENTS.md)
- Implementation mapping: [semantic model](../../architecture/semantic-model.json) + [implementation topology](../../architecture/implementation-topology.json)

There is currently no public export, runtime adapter, persistence owner or Web consumer. Add those only when the Workforce use case and authority are explicitly decided and validated.
