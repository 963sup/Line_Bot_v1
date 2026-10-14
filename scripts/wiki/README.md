# Wiki internal command

`pnpm wiki:run` reads one JSON request from stdin and invokes authenticated [Wiki](../../docs/owners/wiki.md) capabilities through public package exports. Build workspaces before running it. `proof` is a fresh LIFF access token; never put it in argv, examples, logs or committed files.

- Read operations: `list` with `repositoryId`; `read` and `history` with `query` containing Repository/page IDs; `compare` additionally supplies `beforeId` and `afterId`.
- Write operation: `execute` with a strict `command` containing Repository/page IDs, request UUID, expected version and action-specific fields.
- A command may mutate the configured database. Run only against an explicitly authorized target. The CLI verifies LINE proof and current User qualification; Wiki owns business authorization and transaction/replay behavior.

No HTTP route, UI, production probe or scheduler is installed by this command.
