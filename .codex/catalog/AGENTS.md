# Candidate catalog constraints

This directory owns L3 role taxonomy and L5 Atomic dispatch contracts. It does not own product contracts, tool permissions, or provider authority.

- `role-catalog.json` is the only role-candidate list; `agents/*.toml` remains the only runtime role declaration.
- `atomic-catalog.json` is the only Atomic list. An entry stays `candidate` until a real consumer and matching executor profile, capability route, handoff, and evidence boundary are established. An enabled entry has exactly one `executorRoleId`; candidates never do.
- Keep identifiers stable, lowercase, and semantic. Every entry describes exactly one observable responsibility.
- Candidate status never authorizes delegation, shell/MCP use, a write, or an external operation.
- Update the matching schema and owner documentation together. Do not copy entries into L2/L3/L4 documentation.

Validate JSON and links through the parent-assigned `.codex` validation plan. Static success does not prove a live Codex session loaded a profile or route.
