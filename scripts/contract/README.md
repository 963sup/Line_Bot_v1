# Contract internal command

`pnpm contract:run` reads one JSON request from stdin and invokes authenticated Contract capabilities through public package exports. Build workspaces before running it. `proof` is a fresh LIFF access token; never put it in argv, examples, logs, or committed files.

- Read operations: `list` with `repositoryId`; `read` and `history` with a bounded `query` containing Repository and Contract IDs.
- Write operation: `execute` with a strict `command` containing Repository and Contract IDs, request UUID, expected version, and action-specific fields.
- Draft `create` and `edit` commands supply the full 1 to 100 line set. `activate` and `close` add no fields.
- A command may mutate the configured database. Run only against an explicitly authorized target. The CLI verifies LINE proof and current User qualification; Contract owns business authorization and transaction/replay behavior.

No HTTP route, UI, production probe, scheduler, credential logging, or automatic external work is installed by this command.
