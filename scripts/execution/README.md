# Execution internal command

`pnpm execution:run` reads one bounded JSON request from stdin and invokes authenticated Execution capabilities through public package exports. Build workspaces before running it. `proof` is a fresh LIFF access token; never put it in argv, examples, logs or committed files.

- `execute` supplies a strict command with Repository/Execution IDs, request UUID, expected version and action fields.
- `read`, `list` and `history` supply their documented `query`; pagination uses `after` or `before`.
- The authenticated actor comes only from verified `proof`. Actor or role claims in input never grant identity or permission.
- A command may mutate the configured database. Run only against an explicitly authorized target.

No HTTP route, UI, production probe or scheduler is installed by this command.

## Failure and recovery

The [shared CLI failure contract](../runtime/README.md#contract-and-execution-failures) defines safe output, classification and unknown-result recovery. Execution supplies its public `ExecutionError`; its business codes remain authoritative.

`run.test.mjs` executes the real CLI with test-only module hooks; it requires no provider, database, environment file, or built workspace output.
