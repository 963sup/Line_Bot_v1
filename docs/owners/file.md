# File

File owns Repository-scoped protected original File versions and user-triggered ProcessingRuns. Each Run owns its original untrusted RawResult and optionally a user-selected SavedResult within immutable revisions. File does not own Contract, Content, Resources, Project, WBS or Execution.

## User workflow

Upload → File List → Select a File revision and available Parser/OCR/AI → Run → Preview → Edit locally / Discard / Save.

- **Upload** first commits an immutable Repository/actor/request/file/version/size/digest Intent, then uploads private bytes outside DB locks, verifies readback, and atomically finalizes FileRevision/head/receipt. Pending intents are never visible in File List and never start ProcessingRun.
- **File List / Preview** are read-only; viewing a File never starts processing.
- **Run** is an explicit authorized command pinning source File revision/hash, selected processor ID/version/kind and request/attempt identity. Processing commits RUNNING before external I/O, releases the transaction during provider execution, then rechecks current permission and attempt identity before committing READY/FAILED.
- **Preview** reads the current READY RawResult. Unsaved edits are browser-local and may disappear when the page closes.
- **Save** atomically appends a revision with an optional bounded set of replace/exclude edits and a SavedResult. Unedited values are retained. RawResult, uncertainty and source locator remain intact. **Discard** appends a terminal DISCARDED revision with no SavedResult. Neither action starts another provider call or writes to another Domain.
- **Recovery** never silently retries an unknown external outcome. An explicit new request and observed version can supersede RUNNING/FAILED; stale completions are fenced. READY/SAVED/DISCARDED cannot be silently reprocessed under the same RunId.

## Current supported capability

Authenticated [File CLI](../../scripts/file/README.md) supports Upload, Repository-scoped File List, exact File read/download, explicit Run, Preview and Save/Discard. The Repository Web/LINE route `/{login}/{repository}/files` consumes the same public contract, including File-owned ProcessingRun history. Its initial Web transport uses a 3 MB Upload/Download limit, distinct from the 45 MiB File/CLI capability. Original bytes are limited to 45 MiB at the File owner, checked with SHA-256, and stored **only** in private `repository-files` Supabase Storage. PostgreSQL owns metadata and upload intents, not a redundant `bytea` copy. Media type is declared metadata, not proof of content safety.

Native UTF-8 plain-text Parser returns located line observations. Explicit Gemini AI accepts configured PDF/JPEG/PNG/WebP inputs without a mandatory text-only stage, automatic retry or fallback. Excel/Word bytes may be stored, but their native processors and standalone OCR are **not yet implemented**. Unsupported Run operations fail closed.

Raw values, original units, missing values, page/text/image/worksheet locations and uncertainty are preserved; a processor's output is untrusted candidate data, not a verified measurement. 500 observations and 4,000 UTF-16 code units per value are existing limits. Overflow is rejected rather than silently truncated. Source coordinates and provider confidence cannot be treated as proof of correctness.

## Authorization and consistency

Current active User, effective Repository permission and archive state come from Repository's public transaction-bound scope. File evidence reads require effective read/triage/triage_plus/write/maintain/admin, not visibility alone; mutation requires write/maintain/admin. Archive permits authorized read/exact replay but blocks new writes and processing completion.

Original File/ProcessingRun revisions remain immutable. Durable Upload Intent precedes external Storage I/O; only exact byte/digest readback permits atomic PostgreSQL Finalize. Exact request retry can recover unknown provider outcomes without overwriting. Version/receipt/current Repository qualification are enforced at the transaction boundary; source read access is rechecked after external object download. Storage service-role credential stays server-only and is never authorization. No paths, raw payloads or credentials appear in errors.

File also publishes a narrow transaction-bound SavedResult reference reader for authorized target
owners. It rechecks current protected File access, exact SAVED revision and retained observation,
returning identity evidence without storage credentials or original bytes. Content is the first
explicit consumer; it owns its own later reviewed import command and audit pin, never a File
write-through.

File Save is **not** Contract activation, Content plan publication, Resources creation, WBS Baseline publication, legal approval or Execution. Later business import, if requested, must be a distinct user command owned by its target Domain.

## Source and evidence

Authoritative SQL: [615_files.sql](../../supabase/schemas/615_files.sql). Machine semantics: [semantic model](../../architecture/semantic-model.json), [implementation topology](../../architecture/implementation-topology.json), [data topology](../../architecture/data-topology.json). Source: `packages/file`.

The code delivery includes CLI, File Storage Adapter, Repository-scoped Web transport/presentation and native tests. The ordinary Web/LINE File composition exposes only File queries/commands and the put/read FileObjectStore capability; a distinct trusted-operator composition exposes FileReclamation plus the destructive FileObjectRemoval capability, reusing the same PostgreSQL and private Storage Adapters. A protected actor-only Pending Upload query survives Browser state clearing: recovery requires an explicit original-file reselection and reuse of the exact prior RequestId; the File owner rechecks the SHA-256 fingerprint, permissions and head version. Historical Run retry resolves its pinned FileRevision and Processor version, not the current File head. Private Bucket desired state lives only in `supabase/config.toml` and publication belongs to guarded current-main Release. Resumable/large Browser uploads, standalone OCR, Excel/Word processors, automatic retention scheduling, independent backup verification, Production readback and live Provider/LINE device acceptance remain unverified or undelivered. Trusted operators may plan and explicitly reconcile never-committed Upload Intents after their chosen cutoff and a seven-day database-clock quiet period. Quarantine fences concurrent Finalize before private object deletion and absence readback. The historical `reclaimed_at` column records the latest verified absence and rotates bounded reconciliation pages; it is not proof that an unknown earlier write cannot complete later. A failed removal leaves quarantine durable for deliberate retry. No automatic deletion, Storage-wide sweep, or new Owner is introduced. No production mutation from this PR branch.
