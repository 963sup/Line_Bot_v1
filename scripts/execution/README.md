# Execution internal command

`pnpm execution:run` reads one bounded JSON request from stdin and invokes authenticated Execution capabilities through public package exports. Build workspaces before running it. `proof` is a fresh LIFF access token; never put it in argv, examples, logs or committed files.

- `execute` supplies a strict command with Repository/Execution IDs, request UUID, expected version and action fields.
- `read`, `list` and `history` supply their documented `query`; pagination uses `after` or `before`.
- `dependencies` reads `{repositoryId,planRevisionId}` in `query`; a valid Content plan without a graph returns version zero. A missing plan returns `NOT_FOUND`.
- `replace-dependencies` sends `{action:"replace",repositoryId,planRevisionId,requestId,expectedVersion,edges:[{taskId,prerequisiteTaskId}]}` in `command`. It atomically replaces the Execution-owned acyclic graph under current write permission.
- The authenticated actor comes only from verified `proof`. Actor or role claims in input never grant identity or permission.
- A command may mutate the configured database. Run only against an explicitly authorized target.

New submission commands identify the exact Contract line, exact Content Task, observed dependency
graph version and any physical Resource revision pins:

```json
{
  "operation": "execute",
  "proof": "<fresh LIFF access token>",
  "command": {
    "action": "submit",
    "repositoryId": "repository-id",
    "executionId": "11111111-1111-4111-8111-111111111111",
    "requestId": "22222222-2222-4222-8222-222222222222",
    "expectedVersion": 0,
    "contractId": "33333333-3333-4333-8333-333333333333",
    "contractRevisionId": "44444444-4444-4444-8444-444444444444",
    "lineId": "55555555-5555-4555-8555-555555555555",
    "task": {
      "planRevisionId": "66666666-6666-4666-8666-666666666666",
      "nodeId": "77777777-7777-4777-8777-777777777777"
    },
    "resources": [
      {
        "resourceId": "88888888-8888-4888-8888-888888888888",
        "resourceRevisionId": "99999999-9999-4999-8999-999999999999"
      }
    ],
    "observedDependencyVersion": 3,
    "quantity": "12.5",
    "note": "Installed section A"
  }
}
```

The Task must match the Contract Task directly or descend from its pinned Work in the same plan
revision. Each supplied Resource pin is requalified through Resources. The dependency version is a
consistency observation; submission does not assert prerequisite completion because no Task
completion state exists. Historical Resource-based Contract lines cannot receive new submissions.

`accept` adds no action fields. `reject` and `void` add `reason`; each review uses the observed
Execution version. Task dependency replacement is a separate package capability and is not exposed
by this CLI.

No HTTP route, UI, production probe or scheduler is installed by this command.

## Failure and recovery

The [shared CLI failure contract](../runtime/README.md#contract-and-execution-failures) defines safe output, classification and unknown-result recovery. Execution supplies its public `ExecutionError`; its business codes remain authoritative.

`run.test.mjs` executes the real CLI with test-only module hooks; it requires no provider, database, environment file, or built workspace output.
