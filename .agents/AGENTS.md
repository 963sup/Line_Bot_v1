# Agent capabilities scope

- `.agents/` owns reusable agent capabilities/references, never product/architecture/data/security truth.
- Repository truth remains code/schema/manifest/tests/nearest AGENTS/canonical docs; skills cannot override it.
- External skill provenance/version/hash belongs to root `skills-lock.json`; imported skill corpus is not rewritten into repository governance.
- Load skills only when relevant; do not add overlapping skills without a real consumer or external boundary.
- Preserve provenance/license on updates; never inject secrets or private project data into skills.
- Project rules already enforced by code/types/guards/tests/docs are referenced, not duplicated.
- Before applying a skill, verify its tools/commands exist in the current runtime; examples are not installation evidence or authorization.
