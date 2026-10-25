# Candidate role and atomic catalog

**Owner:** L3/L5 candidate classification. **Audience:** Primary and role authors.

This directory is the single taxonomy for roles and Atomic operations. It is deliberately separate from [`../agents/`](../agents/README.md): role entries classify execution boundaries, and only an enabled Atomic may select its one executor. Neither entry grants a tool, provider, repository, or approval authority.

| File | Role | Consumer | Effect boundary |
| --- | --- | --- | --- |
| [role-catalog.json](role-catalog.json) | 58-role taxonomy with candidate/enabled/retired state | L2/L3 selection and static validation | Only enabled executor entries map to profiles |
| [atomic-catalog.json](atomic-catalog.json) | Atomic task contracts | L2/L3/L5 task design and static validation | Only enabled entries derive one executor; none grant capability |

## Status and promotion

`candidate` records a bounded responsibility that is not available for runtime dispatch. `enabled` role means an execution boundary maps to a real `../agents/l3-*.toml` profile. `enabled` Atomic means it has exactly one enabled executor, all specialised task rules, normal L4 preflight, L5 handoff, and L6 evidence flow. `retired` records a former specialised profile absorbed by an executor plus an Atomic.

Promote in this order:

1. A real repository consumer demonstrates a responsibility gap.
2. Confirm a single mission, input, deliverable, stop condition, and evidence boundary.
3. Add or update the enabled Atomic's executor, task rules, required capability route, handoff, and validation contract.
4. Add `executorRoleId` only after those consumers exist and static checks pass.

Do not create a profile merely to make the catalog count look complete. Retire a specialised profile when its responsibility is fully absorbed by an enabled Atomic and an existing executor.
