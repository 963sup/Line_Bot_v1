# File constraints

Inherits [packages](../AGENTS.md). [File owner](../../docs/owners/file.md) owns protected original File revisions and bytes. Intelligence owns ProcessingRuns, processing results and their history.

- Upload and File List never invoke processors. Processing commands belong to Intelligence and require an explicit File revision, supported processor, version and request identity.
- File owns exact source qualification and byte reads through its public source contract. Intelligence owns Processor capability, output validation, ProcessingRun lifecycle, results and processing history.
- Historical processor output is read-only evidence during cutover. File has no current preview, edit, save, discard, or result writer; those capabilities belong to Intelligence and Contract.
- Current Repository permission must be rechecked on read, replay and completion. Public visibility is not File evidence authorization.
- A retry of the same RunId must preserve exact original FileRevision and Processor id/version/kind; changing the processor is a new explicit Run. Current historical rows remain read-only until an explicit controlled retention cutover.
- Durable Upload Intent commits before private Storage I/O. Only exact object readback allows a transactional FileRevision/head/receipt Finalize; there is no second PostgreSQL bytea store. Explicit identical-request retry recovers unknown outcomes; never overwrite objects.
- General File/Web dependency wiring must expose only FileObjectStore put/read; the destructive FileObjectRemoval Port and global FileReclamation Port belong exclusively to trusted-operator composition. Both reuse one technical Storage Adapter without granting delete access to ordinary File application contracts.
- An operator-supplied cutoff plus seven-day database-clock inactivity gate permits only never-committed Intents to be quarantined under the existing request/File locks. Object removal needs independent absence readback; each successful observation refreshes the durable reconciliation cursor because an unknown write may complete later. Failure leaves durable quarantine for explicit retry. No automatic deletion and no exposure via Web/LINE.
- Historical processing relations remain as retained evidence until a separately controlled migration/retention cutover. No new File processing writes are allowed; consumers use Intelligence's public contracts.
- Processing intent commits before provider I/O and completion is fenced by attemptId. Unknown provider outcome cannot be blindly retried.
- Preserve tenant isolation, version conflict, exact replay, historical evidence, rollback and minimal disclosure. File never mutates Contract/Content/Resources/Project/WBS/Execution.
- Secrets, original payloads, provider output and personal data never enter diagnostic logs.

Validation: domain state transitions, explicit processor selection, authorization/replay, source and result immutability, receipt rollback, native database competition and provider adapters. Simulated provider tests do not prove live OCR/AI accuracy or LINE device acceptance.
