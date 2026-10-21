# Contract internal command

`pnpm contract:run` reads one JSON request from stdin and invokes authenticated Contract capabilities through public package exports. Build workspaces before running it. `proof` is a fresh LIFF access token; never put it in argv, examples, logs, or committed files.

- Read operations: `list` with `repositoryId`; `read` and `history` with a bounded `query` containing Repository and Contract IDs.
- Write operation: `execute` with a strict `command` containing Repository and Contract IDs, request UUID, expected version, and action-specific fields.
- Draft `create` and `edit` commands supply the full 1 to 100 line set. `activate` and `close` add no fields.
- A command may mutate the configured database. Run only against an explicitly authorized target. The CLI verifies LINE proof and current User qualification; Contract owns business authorization and transaction/replay behavior.

No HTTP route, UI, production probe, scheduler, credential logging, or automatic external work is installed by this command.

## Failure and recovery

Failures keep the generic `error` text and add safe top-level `status` and `code` fields. The process exits with status 1 and never prints the caught message, stack, credential, or provider payload.

| Phase | Result |
| --- | --- |
| Invalid stdin or operation | `400 INVALID_INPUT` |
| Invalid LINE proof | `401 UNAUTHENTICATED` |
| Missing or inactive current User | `403 FORBIDDEN` |
| LINE or other pre-dispatch infrastructure unavailable | `503 UNAVAILABLE` |
| Contract rejects with a typed `ContractError` | Owner `status` and `code` |
| `execute` starts, then availability or an untyped failure occurs | `503 UNKNOWN_RESULT` |

`UNKNOWN_RESULT` does not prove rollback or absence of a write. Do not create a new request ID or automatically retry. Read back state, then, only when needed, replay the exact canonical command with the same actor and request ID so Contract ownership and replay rules decide the result.

`run.test.mjs` executes the real CLI with test-only module hooks; it requires no provider, database, environment file, or built workspace output.
