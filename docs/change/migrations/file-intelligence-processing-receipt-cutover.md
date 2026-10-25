# File → Intelligence processing history cutover

Status: required before legacy ProcessingRun storage can be retired. This is a preserved-data
cutover, not a normal schema reconciliation and not an authorization to mutate production.

## Immutable boundary

File continues to own original bytes, File revisions, Upload Intents and File command receipts.
Intelligence owns all current ProcessingRuns. Existing `file_processing_runs`,
`file_processing_revisions` and `file_commands.kind='processing'` rows remain immutable until this
procedure has completed with exact readback. No application writer may create another legacy row.

The shared `file_commands` relation cannot be assigned wholesale to Intelligence: its
`kind='file'` receipts remain File facts. Processing receipts must therefore move into a separate
Intelligence-owned history receipt relation with an explicit legacy namespace; they must not be
inserted into `intelligence_processing_commands`, whose request identity namespace belongs to
current runs.

## Preconditions

1. The release is on validated current `main`, the target project and schema are identified, and
   provider recovery evidence satisfies the Release cutover policy.
2. A maintenance window freezes legacy writers. File Upload remains independently available;
   only old processing writer entrypoints are frozen.
3. Preflight records, for every source relation, row count plus a deterministic SHA-256 over the
   canonical ordered row representation. The representation includes every persisted column and
   uses explicit null markers and stable JSON canonicalization.
4. The destination history relations, constraints, RLS, grants and Intelligence read adapter have
   been deployed but are not yet selected for reads.

## Atomic transformation

Within one operator-owned transaction:

1. Lock the legacy processing runs, revisions and only `file_commands` rows where
   `kind='processing'`; do not lock or rewrite File upload receipts beyond required FK safety.
2. Copy every run and revision with the original IDs, Repository/File/source pin, version chain,
   actor, timestamps, processor identity, state, raw/saved results, edits and failure value.
3. Copy each processing receipt to the separate Intelligence legacy receipt relation, preserving
   actor, request ID, Repository, run, processing revision and fingerprint. Its namespace is
   `legacy-file-processing`; a collision with a current Intelligence receipt is a hard conflict,
   never an overwrite.
4. Read the destination in the same transaction and compare source/destination counts and hashes
   for runs, revisions and processing receipts. Any mismatch aborts the transaction.
5. Persist one cutover marker containing exact release revision, timestamp, counts and hashes;
   only then enable Intelligence reads from the destination history relations.

## Readback and recovery

After commit, an authorized readback must independently verify:

- the marker, target schema and release revision;
- source and destination count/hash equality;
- every legacy receipt resolves to the same immutable run revision and fingerprint;
- current File receipts remain in `file_commands` unchanged;
- authorized Intelligence history reads work, while a foreign actor and foreign Repository cannot
  read any migrated row;
- current Intelligence request replay remains isolated from the legacy namespace.

If deployment or readback fails, keep legacy writers frozen and repair forward from the preserved
source relations. Do not delete source rows or claim rollback by partially copying data. Source
relations remain retained until a separately authorized retention decision proves no history or
replay consumer remains.

## Completion evidence

The cutover is complete only with the committed marker, before/after count/hash artifacts,
authorized readback, release evidence and native PostgreSQL tests for collision, rollback and
cross-Repository isolation. Local schema/tests prove the procedure's contract only; they do not
prove production data or provider recovery.
