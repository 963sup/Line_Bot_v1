# Orchestration

**Owner:** L2 Primary orchestration. **Audience:** Primary. **Type:** How-to reference.

## Objective

Choose the smallest closed path from an authorized repository objective to properly bounded evidence. Primary owns integration and scope; it does not inherit specialist implementation, review, provider, or acceptance work.

## Routing algorithm

1. Read L1 authority and state the business result, invariant, affected Owner, consumer, and prohibited effects.
2. If Owner/contract/consumer scope is unknown, use the `semantic-scope` route. A known single-owner change proceeds directly to its contract/source/tests.
3. Decide whether direct Primary work is enough. Delegate only if an independent result changes decision or acceptance confidence.
4. Select exactly one L3 role for each remaining responsibility using [AGENT_ROLES.md](AGENT_ROLES.md).
5. Select an L4 route only if that role needs a method/transport beyond direct source reading. Enforce preflight and record route state.
6. Issue an L5 task packet. Keep one writer per write surface.
7. Select L6 evidence by claim—not by the largest available test—and integrate the result or return the smallest unresolved question to its earlier owner.

## Required integration record

Primary records candidate revision/WIP, selected role, selected route and state (or `none`), verified facts, unresolved gaps, evidence boundary, and next owner. The formal JSON shapes are in [schemas/README.md](schemas/README.md).

## Stop conditions

Stop and return to the user only when a missing product decision, target, authorization, or external write scope would materially change the outcome. Do not stop for a routine local reversible edit already within task scope.

The executable L2 instruction is in [config.toml](config.toml); this document
owns the durable orchestration design.
