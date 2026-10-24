# File operator

`pnpm file:run` reads bounded JSON from stdin, verifies `proof` with the existing LINE identity boundary, and invokes one explicit user operation. Do not pass trusted actor IDs/roles, credential arguments, or raw provider payloads to logs.

| Operation | Request | Behavior |
| --- | --- | --- |
| `upload` | `sourcePath`, `command:{repositoryId,fileId,requestId,expectedVersion,name,mediaType}` | Durable Intent → private object upload/readback → atomic FileRevision Finalize, at most 45 MiB; never Run. |
| `list` | `repositoryId`, optional `after` | Return up to 20 currently authorized committed File descriptors. |
| `pending-uploads` | `repositoryId`, optional `after` | Return up to 20 incomplete Upload Intents owned by the current actor, to recover the original request after reconnect. No file bytes or private object paths. |
| `read-file` | `repositoryId,fileId`, optional `revisionId` | Return authorized descriptor. |
| `download` | `repositoryId,fileId,revisionId,destinationPath` | Authorized exact bytes to new file mode 0600. |
| `run` | explicit `processor`, `command:{repositoryId,runId,fileId,fileRevisionId,requestId,expectedVersion}` | Execute selected processor against immutable source; create read-only Preview. |
| `read-processing` | `repositoryId,runId`, optional `revisionId` | Read RawResult, SavedResult and run status without mutation. |
| `result` | `command:{repositoryId,runId,requestId,expectedVersion,action:"save"|"discard",edits?}` | User explicitly Saves or Discards the READY Preview. |

Optional `edits` on Save: `{observationId,action:"replace",value}` or `{observationId,action:"exclude"}`. Save with no edits preserves all candidate observations; it does not assert they are accurate. Original evidence and uncertainty are never replaced.

`processor:"plain-text"` is the native UTF-8 Parser. `processor:"gemini"` invokes explicitly chosen PDF/image AI with `GEMINI_API_KEY` and `GEMINI_MODEL`; it will not silently fall back. OCR and Excel/Word processing are not yet implemented. Unsupported media fails before starting an attempt.

Uploads require server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, never CLI input or browser state. The Private Bucket must be published by current-main Release. Unknown Storage outcomes remain pending; explicitly retry the **same** upload request/bytes for readback and Finalize, never blindly overwrite. Orphan cleanup/retention is separately governed by `pnpm file:reclaim`; no uncommitted object is removed automatically.

Exact ProcessingRun request replay returns original RUNNING receipt, not a second provider call. Read current processing state for completion; retry an unfinished Run only as an explicit new request with observed version. File Save never mutates Contract/Content/Resources/Project/WBS/Execution.

Trusted File orphan reconciliation is a separate operator contract: `pnpm file:reclaim plan <exact UTC cutoff>` is read-only and reports counts only. `apply` requires a validated exact-current-main Release context and service-only credentials, not yet wired into the main-push-only Release workflow; never invoke from a branch or workstation. The File owner quarantines never-committed Intents quiet for at least seven days, then removes only their private objects and independently verifies absence. Each successful check refreshes a durable cursor because an unknown earlier PUT can complete after an absence was observed. One command examines at most 20 oldest cursors; `pageFull` describes only that bounded page and must not drive an unbounded `while` drain. A provider failure stops the current command and retains quarantine, so repeated failure of the oldest candidate can delay later candidates. Retry remains separately authorized; there is no automatic deletion.

Build first with `pnpm exec turbo run build --filter=@line_bot_v1/file...`. Run tests with `pnpm --filter @line_bot_v1/file test`.
