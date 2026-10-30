# Web WBS Transfer Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move WBS scope-transfer recovery validation from `apps/web` to the
existing WBS owner without changing browser recovery behavior.

**Architecture:** `apps/web` will retain localStorage reads, React state, and
panel interaction. `@line_bot_v1/wbs` will own the pure validation and
reconciliation of persisted transfer-recovery state because that state encodes
WBS transfer receipts and is permitted to consume the Project and Repository
contracts it validates.

**Tech Stack:** TypeScript 5.9, Node test runner via `tsx`, pnpm workspace,
Serena v2 LSP.

**Spec:** `docs/superpowers/specs/2026-10-30-web-owner-relocation-design.md`

## Global Constraints

- Keep URLs, browser storage keys, request identity, authorization, replay,
  recovery, and observable API behavior unchanged.
- Keep Next.js, React state, browser storage, HTTP transport, and response
  projection in `apps/web`.
- Move only the pure WBS transfer-recovery validation and reconciliation logic.
- Cross-package access uses only `@line_bot_v1/wbs` public exports.
- Preserve the existing failure messages and rejection behavior covered by the
  current Web test.
- Use Serena v2 LSP references before deletion and after the consumer import
  is updated.

## Review Focus

- Persisted recovery state with a mismatched actor, repository, version, or
  revision must remain rejected; Task 1 moves the existing negative cases.
- An accepted transfer must match the transfer command IDs and source state;
  Task 1 retains this receipt-consistency test.
- A persisted cancellation is reusable only for the same requested transfer;
  Task 1 retains both reusable and non-reusable cases.
- The client bundle must not acquire a server-only dependency; Task 2 runs Web
  typecheck after importing the WBS public API.
- No remaining Web consumer may import the deleted local module; Task 2 runs
  Serena references and bounded static search before deleting it.

---

## File structure

- Create `packages/wbs/src/application/transfer-recovery.ts`: WBS-owned pure
  recovery types and validation functions.
- Create `packages/wbs/test/transfer-recovery.test.ts`: unit coverage moved
  from the Web module, retaining malformed and stale recovery-state cases.
- Modify `packages/wbs/package.json`: expose the WBS recovery API at
  `@line_bot_v1/wbs/application/transfer-recovery`.
- Modify `apps/web/src/modules/repository/wbs-transfer-panel.tsx`: import the
  recovery API through the WBS public export.
- Delete `apps/web/src/modules/repository/wbs-transfer-state.ts` and
  `apps/web/test/wbs-transfer-state.test.ts` after all consumers migrate.

### Task 1: Create the WBS-owned recovery API and tests

**Files:**

- Create: `packages/wbs/src/application/transfer-recovery.ts`
- Create: `packages/wbs/test/transfer-recovery.test.ts`
- Modify: `packages/wbs/package.json`

**Interfaces:**

- Consumes: `parseProjectManagementCommand`, `ProjectManagementCommand`, WBS
  transfer command parsers, transfer DTOs, and `parseWbsScopeTransfer` through
  existing public package exports.
- Produces: `CreateTransferProjectCommand`, `WbsTransferOperation`,
  `WbsTransferCancellation`, `parseWbsTransferOperation`,
  `parseWbsTransferCancellation`, and `reconcileWbsTransferCancellation` from
  `@line_bot_v1/wbs/application/transfer-recovery`.

- [ ] **Step 1: Create the failing WBS recovery test**

Move the assertions from `apps/web/test/wbs-transfer-state.test.ts` into
`packages/wbs/test/transfer-recovery.test.ts`, importing the proposed local
source module. Keep the current cases for valid recovery, actor/version/revision
mismatch, receipt mismatch, cancellation mismatch, and cancellation
reconciliation.

- [ ] **Step 2: Run the recovery test to verify it fails**

Run: `pnpm exec tsx --test packages/wbs/test/transfer-recovery.test.ts`

Expected: FAIL because `../src/application/transfer-recovery.js` does not yet
exist.

- [ ] **Step 3: Implement the WBS recovery API**

Create `packages/wbs/src/application/transfer-recovery.ts` by relocating the
pure types and three functions from the Web state module. Retain all validation
conditions and failure messages. Import Project and WBS types/parsers through
their public exports; do not import any Web module or Next.js code.

- [ ] **Step 4: Expose the public WBS API**

Add `./application/transfer-recovery` to `packages/wbs/package.json`, mapping
its types and default entry to the corresponding `dist/application` output.

- [ ] **Step 5: Run package tests and typecheck**

Run: `pnpm exec tsx --test packages/wbs/test/transfer-recovery.test.ts && pnpm --filter @line_bot_v1/wbs typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/wbs/package.json packages/wbs/src/application/transfer-recovery.ts packages/wbs/test/transfer-recovery.test.ts
git commit -m "refactor(wbs): own transfer recovery validation"
```

### Task 2: Migrate the Web panel to the WBS public API

**Files:**

- Modify: `apps/web/src/modules/repository/wbs-transfer-panel.tsx`
- Delete: `apps/web/src/modules/repository/wbs-transfer-state.ts`
- Delete: `apps/web/test/wbs-transfer-state.test.ts`

**Interfaces:**

- Consumes: the six exported recovery types/functions from
  `@line_bot_v1/wbs/application/transfer-recovery`.
- Produces: no new API; `WbsTransferPanel` retains its existing props,
  localStorage behavior, and user-visible recovery flow.

- [ ] **Step 1: Verify the local module has only the panel consumer**

Use Serena v2 LSP `find_referencing_symbols` for all three functions in
`wbs-transfer-state.ts`, then use bounded text search for its module path.

Expected: only `wbs-transfer-panel.tsx` imports the local module; the test is
the only non-production consumer.

- [ ] **Step 2: Update the panel import**

Replace the relative `./wbs-transfer-state` import with the WBS public export.
Keep all localStorage, React state, and recovery control flow in the panel.

- [ ] **Step 3: Run Web typecheck before deleting the local module**

Run: `pnpm --filter @line_bot_v1/web typecheck`

Expected: PASS and no browser/server boundary violation.

- [ ] **Step 4: Delete the migrated Web module and duplicate test**

Delete `wbs-transfer-state.ts` and its Web-only test after the new WBS test
passes. Do not alter browser storage key names or panel behavior.

- [ ] **Step 5: Verify no stale consumer remains**

Run: `rg -n 'wbs-transfer-state|parseWbsTransferOperation|parseWbsTransferCancellation|reconcileWbsTransferCancellation' apps/web packages/wbs -g '*.ts' -g '*.tsx'`

Expected: no `wbs-transfer-state` path remains; recovery symbol definitions
are in WBS and their only Web production use is the panel's public import.

- [ ] **Step 6: Run affected validation**

Run: `pnpm --filter @line_bot_v1/wbs test && pnpm --filter @line_bot_v1/web typecheck && pnpm check dependencies`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/web/src/modules/repository/wbs-transfer-panel.tsx apps/web/src/modules/repository/wbs-transfer-state.ts apps/web/test/wbs-transfer-state.test.ts
git commit -m "refactor(web): consume WBS transfer recovery API"
```

## Self-review

- The plan preserves every design requirement: Web retains browser and delivery
  work; WBS receives only pure transfer recovery semantics.
- The new public API name, source path, package export, consumer import, and
  package test all use `transfer-recovery` consistently.
- Task 1 produces the public interface Task 2 consumes.
- Review-focus cases are covered by the moved unit test, Web typecheck, Serena
  reference check, and dependency validation.
- This plan is limited to one WBS transfer-recovery capability; later
  Repository discovery batches remain separate work.
