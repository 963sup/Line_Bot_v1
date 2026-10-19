# Project operations

`pnpm project:imports --live --sha <40-hex-sha>` processes bounded Repository Issue admission batches through the Project owner runtime. The scheduled workflow runs every five minutes and after a successful Release. GitHub may delay scheduled runs.

Before opening a database connection, the command verifies current `main` and the exact revision's completed successful production Release, including full validation and the required schema/runtime steps. An unchanged schema or Web runtime may retain the Release workflow's explicit skipped result; a new deployment requires successful identifier-runtime activation. The workflow supplies the existing database connection only to this step; the runtime reduces every transaction to `line_app`.

The Project owner rechecks the captured delegate qualification version, current Project `ADMIN` and open lifecycle, and current Repository access. Concurrent workers skip busy Projects; committed membership and explicit-removal exclusions make restart safe. Revoked delegation disables the import with immutable Project event evidence. Source Issue content and lifecycle remain Issue-owned.

The independently configured `SUPABASE_URL`, database URL and pinned `SUPABASE_CONFIRM_PROJECT` must identify the same production project before a connection is opened. The operation reuses the canonical remote-target checks; stale or misconfigured connection credentials cannot redirect this worker to another project. Logs include the verified project reference and aggregate counts, never connection credentials or Issue content.

`node --test scripts/project/imports.test.mjs` verifies the release gate without network access or credentials. Persistent admission tests live in `packages/project/test/repository-imports.test.ts`.
