# LINE Rich Menu Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically validate and reconcile LINE Rich Menu changes after they reach `main`, while keeping product definitions, LINE protocol, reconciliation, and GitHub automation loosely coupled.

**Architecture:** The Web Rich Menu module remains the product desired-state owner. The LINE package remains a provider adapter. A repository-owned TypeScript provider command builds an immutable in-memory manifest, compares stable remote metadata, and publishes only changed pages through the existing publication policy. GitHub workflows invoke preview, release, and drift reconciliation; they own triggers, secrets, concurrency, and deployment gates.

**Tech Stack:** TypeScript, Node 24, pnpm, tsx, existing LINE transport, GitHub Actions, Biome, existing Web Rich Menu tests.

**Spec:** The approved Rich Menu design in the conversation: image/definition changes trigger automatic reconciliation after merge to `main`; PRs validate only; release uses exact SHA, Web deployment ordering, readback, stable aliases, delayed cleanup, and drift recovery.

## Global Constraints

- Product Rich Menu definitions stay under `apps/web/src/modules/assistant/rich-menu`.
- LINE API and provider validation stay under `packages/line/src/rich-menu`.
- Repository operation entrypoints are TypeScript under `scripts/providers`.
- No LINE token is required for PR preview or local static validation.
- External mutation requires `LINE_CHANNEL_ACCESS_TOKEN`, exact `main` revision, concurrency serialization, and provider readback.
- Do not claim device acceptance from API readback.
- Preserve stable aliases and do not delete old Rich Menus during the same publish transaction.
- All command output is bounded summaries; detailed evidence remains in GitHub step output/artifacts.
- Remove references to nonexistent Rich Menu scripts/workflows/planners.

## Review Focus

- Unchanged remote aliases must not create another Rich Menu.
- A changed image with the same menu definition must publish the changed page.
- A changed definition must publish the changed page and preserve its alias.
- A failed provider readback must fail the workflow without claiming success.
- A missing token must fail only preflight/publish/reconcile, never preview.
- Workflow path filters must include every executable Rich Menu input and exclude unrelated LINE runtime changes.

---

### Task 1: Remove stale Rich Menu references and make ownership truthful

**Files:**
- Modify: `knip.jsonc`
- Modify: `apps/web/src/app/(rich-menu)/README.md`
- Modify: `docs/reference/line/rich-menu.md`
- Modify: `docs/reference/operations/release.md`
- Test: `pnpm docs:check` and targeted `rg` inventory

**Interfaces:**
- Removes references to nonexistent `scripts/providers/line/rich-menu/sync.ts`, `.github/workflows/release.yml`, and `scripts/providers/github/release-plan.mjs`.
- Documents the new `pnpm line:rich-menu` command and workflow ownership without claiming it exists before Task 4.

- [ ] Rewrite the route README to describe only route composition and point provider operations to the new root command.
- [ ] Rewrite the Rich Menu reference around desired state, manifest, reconcile, preview, release, and drift recovery.
- [ ] Update release documentation to describe path-filtered Rich Menu workflow dependencies without the deleted planner.
- [ ] Remove the nonexistent Knip entry.
- [ ] Run the targeted stale-reference search and `pnpm docs:check`.

### Task 2: Add deterministic Rich Menu fingerprinting

**Files:**
- Create: `apps/web/src/modules/assistant/rich-menu/fingerprint.ts`
- Modify: `apps/web/src/modules/assistant/rich-menu/definition.ts`
- Modify: `apps/web/src/modules/assistant/rich-menu/desired-state.server.ts`
- Test: `apps/web/test/rich-menu-desired-state.test.ts` or a focused fingerprint test

**Interfaces:**
- `richMenuFingerprint(input: { page: MenuPage; image: Uint8Array; menu: RichMenuDefinition }): string`.
- `buildRichMenuDesiredState(pages, repositoryRoot)` returns each desired menu with `fingerprint`.
- Remote menu `name` contains a bounded fingerprint marker while preserving the stable page identity.

- [ ] Add failing tests for deterministic hashes, image-sensitive changes, definition-sensitive changes, and stable page names.
- [ ] Implement canonical JSON serialization and SHA-256 fingerprinting with Node crypto.
- [ ] Add the fingerprint marker to generated definitions after the base definition is constructed.
- [ ] Run the focused Rich Menu desired-state tests.

### Task 3: Extend the LINE adapter with remote listing and bounded readback

**Files:**
- Modify: `packages/line/src/rich-menu/menu.ts`
- Modify: `packages/line/src/rich-menu/client.ts`
- Modify: `packages/line/src/rich-menu/types.ts`
- Modify: `packages/line/test/rich-menu.test.ts`

**Interfaces:**
- Add `list(): Promise<RichMenuDefinition & { richMenuId: string }[]>` to the provider client.
- Add provider-side parsing for LINE `richmenu/list` responses.
- Keep transport validation and error handling inside the LINE package.

- [ ] Add adapter tests for valid list responses, malformed list payloads, and provider errors.
- [ ] Implement list parsing and expose it through the public Rich Menu client.
- [ ] Run `pnpm --filter @line_bot_v1/line test` and `typecheck`.

### Task 4: Add the repository TypeScript command and idempotent reconciliation

**Files:**
- Create: `scripts/providers/line-rich-menu.ts`
- Delete: `apps/web/src/modules/assistant/rich-menu/operator.server.ts`
- Modify: `package.json`
- Modify: `knip.jsonc`
- Test: `scripts/providers/line-rich-menu/*.test.ts` or existing Web publication tests

**Interfaces:**
- CLI: `pnpm line:rich-menu preview all`, `preflight all`, `reconcile all`, and `drift all`.
- `reconcileRichMenus(input): Promise<ReconcileResult>` consumes desired state, provider client, and revision; returns per-page `unchanged|published|failed`.
- Preview never reads or mutates LINE.
- Reconcile uses stable aliases, publishes only fingerprint differences, and leaves old IDs for delayed cleanup.

- [x] Add tests for no-op reconciliation, image/definition change, missing token, partial readback failure, and bounded output.
- [x] Implement command parsing with explicit target validation and token gating.
- [x] Build desired state once, list remote menus once, compare alias target and fingerprint marker, then call existing publication primitives only for changed pages.
- [x] Add manifest summary containing revision, page, asset path, byte count, fingerprint, and action; never include tokens.
- [x] Add root script `line:rich-menu`; the workflow uses the single canonical entry.
- [ ] Run focused command tests, Biome, and Knip.

### Task 5: Add GitHub preview, release, and drift workflows

**Files:**
- Create: `.github/workflows/rich-menu-preview.yml`
- Create: `.github/workflows/rich-menu-release.yml`
- Create: `.github/workflows/rich-menu-drift.yml`
- Modify: `.github/workflows/copilot-setup-steps.yml` only if the setup check needs the new command

**Interfaces:**
- Preview triggers on pull requests touching Rich Menu executable inputs and runs no provider mutation.
- Release triggers on `main) push for the same paths, uses exact SHA, waits for required Web deployment evidence, injects `LINE_CHANNEL_ACCESS_TOKEN` only into the mutation step, and uses a per-channel concurrency group.
- Drift runs on a schedule and manual dispatch, performs remote readback/reconcile, and fails closed when token or identity is unavailable.

- [ ] Add workflow YAML with least-privilege contents permissions and bounded command output.
- [ ] Add exact path filters for images, definition, desired-state, publication policy, LINE adapter, CLI, package manifests, lockfile, and workflow files.
- [ ] Add release ordering and current-main SHA checks.
- [ ] Add concurrency and GitHub Environment protection for production LINE.
- [ ] Add workflow syntax/path reference checks without invoking external mutation.

### Task 6: Verify and synchronize documentation

**Files:**
- Modify: `docs/reference/line/rich-menu.md`
- Modify: `docs/reference/operations/release.md`
- Modify: `docs/reference/engineering/validation-pipeline.md` only where the new external boundary needs clarification

**Interfaces:**
- Documentation must distinguish preview, provider readback, publication, drift recovery, and mobile acceptance.

- [ ] Re-run stale-reference inventory.
- [ ] Run affected package tests and TypeScript checks.
- [ ] Run `pnpm lint`, `pnpm docs:check`, and `pnpm deadcode`.
- [ ] Review Git diff for secrets, unsupported paths, duplicated authority, and leftover old release terminology.
- [ ] Report exact verification status and any provider/device evidence not available locally.

