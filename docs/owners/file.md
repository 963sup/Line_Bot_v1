# File

File owns Repository-scoped protected originals, immutable source revisions and private bytes. Intelligence owns document processing lifecycle, provider attempts, extraction evidence and processing history. Contract owns structured Contract facts; Content and Project WBS own their respective expansions. File does not own parsing, extraction results or downstream business records.

## User workflow

Upload → File List → select an immutable File revision → download or let Intelligence read that exact revision.

- **Upload** first commits an immutable Repository/actor/request/file/version/size/digest Intent, then uploads private bytes outside DB locks, verifies readback, and atomically finalizes FileRevision/head/receipt. Pending intents are never visible in File List and never start ProcessingRun.
- **File List** is read-only; viewing a File never starts processing.
- Processing commands, result history and recovery belong to Intelligence and are dispatched through the `ownerKind=intelligence` application route. File only supplies its authorized exact-revision reader.
- Historical `file_processing_*` rows and mixed legacy receipts remain retained evidence. They are not writable through the File application and are not migrated or deleted by ordinary schema reconciliation.

## Current supported capability

Authenticated [File CLI](../../scripts/file/README.md) supports Upload, Repository-scoped File List, exact File read and download. The Repository Web/LINE route `/{login}/{repository}/files` composes File storage with Intelligence processing presentation while dispatching processing commands to Intelligence. Its initial Web transport uses a 3 MB Upload/Download limit, distinct from the 45 MiB File/CLI capability. Original bytes are limited to 45 MiB at the File owner, checked with SHA-256, and stored **only** in private `repository-files` Supabase Storage. PostgreSQL owns metadata and upload intents, not a redundant `bytea` copy. Media type is declared metadata, not proof of content safety.

Native UTF-8 plain-text parsing and configured Gemini PDF/JPEG/PNG/WebP extraction are Intelligence processors. Intelligence owns processor selection, output validation and ProcessingRun lifecycle; File only authorizes and supplies exact source bytes. No automatic retry or fallback. Excel/Word processors and standalone OCR are Intelligence capabilities and are **not yet implemented**; File may store those original bytes without interpreting them. Unsupported Run operations fail closed.

Original bytes and declared metadata are preserved. Parsing limits, candidate validation, source coordinates and uncertainty belong to Intelligence and its processor contract; provider output remains untrusted evidence, not a verified measurement. Browser resumable/chunk upload is a Web transport and Storage adapter capability, not a File domain responsibility; File owns the durable intent/finalize contract after the adapter supplies a verified object.

## Authorization and consistency

Current active User, effective Repository permission and archive state come from Repository's public transaction-bound scope. File evidence reads require effective read/triage/triage_plus/write/maintain/admin, not visibility alone; File mutation and Intelligence processing mutation require write/maintain/admin.

Original File revisions and Intelligence Processing revisions remain immutable. Durable Upload Intent precedes external Storage I/O; only exact byte/digest readback permits atomic PostgreSQL Finalize. File and Intelligence use separate request receipt namespaces. Storage service-role credential stays server-only and is never authorization. No paths, raw payloads or credentials appear in errors.

Historical saved-result readers are retained only for legacy records. Current Contract intake uses Intelligence's target-intake capability; Contract validates and stores its own complete candidate and confirmation. Content expansion is a separate whole-document command against an exact confirmed Contract revision.

Legacy extraction observations are not Contract facts. Contract intake validates and stores its own complete candidate and confirmation. Content expansion is an explicit whole-document command against an exact confirmed Contract revision; it does not reuse legacy per-observation File imports.

## Contract document source

File publishes two narrow public capabilities for a target owner that needs an original document:

- The source reader authorizes an exact File revision before and after private-object I/O, then returns detached bytes with that revision. It is for a technical orchestrator such as Intelligence; it grants neither Storage nor File persistence authority.
- The transaction-bound revision qualifier verifies Repository/File/Revision/SHA-256 inside the target owner's transaction. It is for the target's immutable source pin; it never reads original bytes or performs object I/O.

Contract uses the qualifier when it saves a ContractDocument revision. Intelligence uses the reader to form an untrusted candidate for Contract's public command. Neither operation changes File metadata or source revisions.

## Source and evidence

Authoritative SQL: [615_files.sql](../../supabase/schemas/615_files.sql). Machine semantics: [semantic model](../../architecture/semantic-model.json), [implementation topology](../../architecture/implementation-topology.json), [data topology](../../architecture/data-topology.json). Source: `packages/file`.

The code delivery includes CLI, File Storage Adapter, Repository-scoped file listing/download and storage lifecycle tests. The ordinary Web/LINE File composition exposes File storage operations and a read-only Intelligence processing projection; Intelligence owns processing commands and provider protocol tests. A protected actor-only Pending Upload query survives Browser state clearing: recovery requires an explicit original-file reselection and reuse of the exact prior RequestId; the File owner rechecks the SHA-256 fingerprint, permissions and head version. Historical processing evidence remains readable but File no longer starts, retries or saves processing runs. Private Bucket desired state lives only in `supabase/config.toml` and publication belongs to guarded current-main Release. Large/browser resumable uploads, automatic retention scheduling, independent backup verification, Production readback and live Storage/LINE device acceptance remain unverified or undelivered. Large/browser resumable uploads belong to the Web transport and Storage adapter and must terminate at File's existing upload-intent/finalize interface. Standalone OCR and Excel/Word processors belong to Intelligence and are tracked there. Trusted operators may plan and explicitly reconcile never-committed Upload Intents after their chosen cutoff and a seven-day database-clock quiet period. Quarantine fences concurrent Finalize before private object deletion and absence readback. The historical `reclaimed_at` column records the latest verified absence and rotates bounded reconciliation pages; it is not proof that an unknown earlier write cannot complete later. A failed removal leaves quarantine durable for explicit retry. No automatic deletion, Storage-wide sweep, or new Owner is introduced. No production mutation from this PR branch.
