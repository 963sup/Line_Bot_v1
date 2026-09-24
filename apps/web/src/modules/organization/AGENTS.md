# Web organization module

- Owns Organization presentation and transport; membership sources, effective membership, invitations and Team scope belong to their owners.
- Explicit Organization ID is a requested scope only; server rechecks participation, role assignment, version and replay at mutation.
- Direct membership and Enterprise Team-derived membership must remain distinguishable in UI and projections.
