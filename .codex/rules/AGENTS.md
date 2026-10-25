# Command-safety policy constraints

**Layer scope:** L4 Capabilities/transports — command-safety adapter.

Read [README.md](README.md) for the rule catalog and policy design. These files only classify shell command patterns for Codex approval; they do not authorize a repository, provider, deployment, schema, or data operation.

- Add or change a rule only when a real, recurring command pattern needs a narrower safety decision. Do not use rules to bypass approval or compensate for missing task authority.
- Prefer the least permissive stable prefix. Keep destructive, irreversible, credential-bearing, remote-write, and broad filesystem operations at `prompt`.
- Every rule needs representative `match` and `not_match` examples proving its intended boundary. Do not broaden an existing allow rule merely for a single command.
- Provider authorization, exact target, recovery, and readback remain owned by the relevant repository contract and runtime adapter.
- Validate any change with `pnpm tooling:rules` and `pnpm tooling:check`; use `pnpm docs:check` when documentation links change.
