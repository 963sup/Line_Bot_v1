# Execution internal command

`pnpm execution:run` reads one bounded JSON request from stdin and invokes authenticated Execution capabilities through public package exports. Build workspaces before running it. `proof` is a fresh LIFF access token; never put it in argv, examples, logs or committed files.

- `execute` supplies a strict command with Repository/Execution IDs, request UUID, expected version and action fields.
- `read`, `list` and `history` supply their documented `query`; pagination uses `after` or `before`.
- The authenticated actor comes only from verified `proof`. Actor or role claims in input never grant identity or permission.
- A command may mutate the configured database. Run only against an explicitly authorized target.

No HTTP route, UI, production probe or scheduler is installed by this command.

## Failure and recovery

Failures keep the generic `error` text and add safe top-level `status` and `code` fields. The process exits with status 1 and never prints the caught message, stack, credential, or provider payload.

| Phase | Result |
| --- | --- |
| Invalid stdin or operation | `400 INVALID_INPUT` |
| Invalid LINE proof | `401 UNAUTHENTICATED` |
| Missing or inactive current User | `403 FORBIDDEN` |
| LINE or other pre-dispatch infrastructure unavailable | `503 UNAVAILABLE` |
| Execution rejects with a typed `ExecutionError` | Owner `status` and `code` |
| `execute` starts, then availability or an untyped failure occurs | `503 UNKNOWN_RESULT` |

`UNKNOWN_RESULT` does not prove rollback or absence of a write. Do not create a new request ID or automatically retry. Read back state, then, only when needed, replay the exact canonical command with the same actor and request ID so Execution ownership and replay rules decide the result.

`run.test.mjs` executes the real CLI with test-only module hooks; it requires no provider, database, environment file, or built workspace output.
