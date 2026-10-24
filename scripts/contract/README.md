# Contract internal command

`pnpm contract:run` reads one JSON request from stdin and invokes authenticated Contract capabilities through public package exports. Build workspaces before running it. `proof` is a fresh LIFF access token; never put it in argv, examples, logs, or committed files.

- Read operations: `list` with `repositoryId`; `read` and `history` with a bounded `query` containing Repository and Contract IDs.
- Write operation: `execute` with a strict `command` containing Repository and Contract IDs, request UUID, expected version, and action-specific fields.
- Draft `create` and `edit` commands supply the full 1 to 100 line set. `activate` and `close` add no fields.
- A command may mutate the configured database. Run only against an explicitly authorized target. The CLI verifies LINE proof and current User qualification; Contract owns business authorization and transaction/replay behavior.

Purchase-order documents use `document-submit` with the complete Contract-owned intake command (`save` or explicit human `confirm`), and `document-receipt` with `query:{repositoryId,documentId,requestId}`. After Intelligence saves a candidate, use `document-read` with `query:{repositoryId,documentId,revisionId?}` and an explicit `outputPath` to review all lines and diagnostics. The protected revision is written to a new local JSON file; an existing file is never overwritten. Standard output contains only the file path and revision/count summary. Keep this review file private and outside version control.

Read the current candidate before confirming it. Confirmation pins the reviewed draft's source, expected count and facts; corrections require a new saved draft. A declared expected count and synthetic 54-line tests do not prove live PDF extraction completeness. These document operations are distinct from the existing Content-pinned engineering commitments below.

New `create`/`edit` lines reference exact Content Work or Task plan items:

```json
{
  "operation": "execute",
  "proof": "<fresh LIFF access token>",
  "command": {
    "action": "create",
    "repositoryId": "repository-id",
    "contractId": "11111111-1111-4111-8111-111111111111",
    "requestId": "22222222-2222-4222-8222-222222222222",
    "expectedVersion": 0,
    "title": "Cable installation",
    "body": "Agreed scope",
    "lines": [
      {
        "lineId": "33333333-3333-4333-8333-333333333333",
        "planRevisionId": "44444444-4444-4444-8444-444444444444",
        "nodeId": "55555555-5555-4555-8555-555555555555",
        "agreedQuantity": "125.5"
      }
    ]
  }
}
```

`edit` uses the same complete `title`, `body` and `lines` shape with the observed Contract version.
`activate` and `close` contain only the common command fields plus their action. Resource/Object-based
line payloads are invalid, including attempts to replay the retired command shape.

No HTTP route, UI, production probe, scheduler, credential logging, or automatic external work is installed by this command.

## Failure and recovery

The [shared CLI failure contract](../runtime/README.md#contract-and-execution-failures) defines safe output, classification and unknown-result recovery. Contract supplies its public `ContractError`; its business codes remain authoritative.

`run.test.mjs` executes the real CLI with test-only module hooks; it requires no provider, database, environment file, or built workspace output.
