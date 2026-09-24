# Project owner scope

`packages/project` is the registered Project workspace/module owner. It intentionally has no runtime source or public export until a real consumer exists.

- Canonical semantics: [Project](../../docs/010-domain-owners/180-project.md)
- Local change constraints: [AGENTS.md](AGENTS.md)
- Parent package rules: [../AGENTS.md](../AGENTS.md)
- Current persistence truth: [Supabase declarative schemas](../../supabase/schemas/)

The module boundary is active for ownership; runtime capability, public API, and Web presentation are not.
