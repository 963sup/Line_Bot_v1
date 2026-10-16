# Account package

Routing and module overview for `@line_bot_v1/account`.

- Semantic Owner: `account`
- Authority document: [`docs/owners/account.md`](../../docs/owners/account.md)
- Machine boundaries: [`architecture/implementation-topology.json`](../../architecture/implementation-topology.json)
- Persistence mapping: [`architecture/data-topology.json`](../../architecture/data-topology.json)

## Scope

User and Account identity records, profile facts, authored public User status, external identity link
states, and achievement records.

Authored User status implements the FPT `UserStatus` fields `message`, `emoji`,
`indicatesLimitedAvailability`, and `expiresAt`. Writes require the current active User, an observed
version, and a durable request identity. A null organization is the only supported audience; this
capability does not mutate LINE or GitHub provider status.
