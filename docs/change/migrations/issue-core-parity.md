# Issue core parity cutover

Status: pending physical contract cleanup. Business runtime parity is active in the expand-compatible schema; this procedure exists only to retire pre-parity storage safely.

## Authority

Issue owns the mapping. Current PostgreSQL structure remains authoritative only in `supabase/schemas/`. This document does not become schema authority and is not a Supabase migration. Production mutation remains restricted to the validated current-main Release / explicitly authorized data-cutover path.

## Stages

### 1. Expand

The current Issue schema keeps nullable legacy `issues.assignee/status` beside canonical `body/state/state_reason/workflow_status` and `issue_assignees`.

- New runtime INSERTs write canonical fields only.
- Reads present legacy rows through the owner mapping without mutating them.
- The first business mutation of a legacy row materializes its exact old assignee/workflow fact and clears the legacy columns in the same Issue transaction.
- No technical materialization adds a separate Issue version or event.

This stage is safe with retained pre-parity rows and must ship before any physical contract removal.

### 2. Backfill, only if physical cleanup is required

Before an explicit remote data cutover:

1. Prove provider recovery with the current recovery gate.
2. Stop or serialize Issue writers for the target environment.
3. Read back the pre-parity population:

```sql
select
  count(*) filter (
    where assignee is not null
      or status is not null
      or state is null
      or workflow_status is null
      or body is null
  ) as legacy_rows,
  count(*) as total_rows
from app_private.issues;
```

4. For each remaining legacy row, preserve only existing facts: copy old assignee identity to `issue_assignees` with unknown `assigned_at=NULL`; set `workflow_status=status`; set `state='OPEN'`, `state_reason=NULL`, `body=''`; then clear old `assignee/status`. Do not change Issue `version` and do not fabricate an Issue event, because this is representation conversion rather than a business transition.
5. Re-read every converted row plus assignee cardinality and prove the legacy count is zero before releasing writers.

The transform is deterministic, but executing it is an external business-data mutation and therefore requires the recovery/authorization evidence above. Generic schema reconciliation must not hide or auto-run it.

### 3. Contract

Only after a zero-legacy readback may a later validated schema change remove `issues.assignee/status`, their legacy FK/check/index and the runtime fallback. The contract release must again pass full validation and remote post-sync second-diff/readback.

## Rollback / recovery

Before any canonical writer has committed new Issue data, a compatible runtime rollback is possible. After canonical writes or an authorized backfill, do not restore the old runtime blindly; stop writers and use forward-fix or provider-backed recovery according to the Recovery contract.
