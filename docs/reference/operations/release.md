# Release

Only a successful same-repository current-main push Validate can release its exact SHA. GitHub owns trigger, permissions, job dependencies, secrets and artifacts; commands own executable operations.

## Pending sources

`pnpm github:release-plan` compares each operation with its own successful ancestor job. Failed/skipped operations do not advance its cursor; a successful same-SHA operation is not repeated on rerun. Missing baseline means first publication.

| Operation | Changed inputs | Command |
| --- | --- | --- |
| Supabase | `supabase/schemas/*.sql` | `pnpm schema:remote sync` |
| Rich Menu | images, publication code and its executable inputs | `pnpm line:rich-menu publish all` |
| Web | Turbo Web build graph, excluding publication-only sources | `pnpm vercel:deploy:production --live --sha <sha>` |
| Attendance scheduler | scheduler code, pending schema or Web runtime since scheduler success | `pnpm attendance:scheduler reconcile --live --sha <sha>` |

No relevant pending source means no remote operation. Source classifiers and tests live in `scripts/github/release-plan.mjs`; do not copy their path lists into YAML.

## Execution

- Supabase directly applies the declared diff, including destructive DDL, then verifies parity/security and unchanged migration history. No automatic historical compatibility repair or unchanged-schema verification.
- Rich Menu has one independent job. Publish performs preflight/create/upload/activate/readback in one process; it does not wait for Supabase or Web deployment.
- Web waits for changed schema sync to succeed; an unchanged, skipped schema job does not block it.
- Scheduler waits for required schema/Web changes to succeed and accepts unchanged dependencies as skipped. It reconciles pg_cron/pg_net/Vault and reads back the exact job. Missing worker credential or inconsistent target/readback fails closed.

Every write keeps a current-main check and exact target. Supabase and scheduler serialize access to the same database. Credentials are step-scoped; general validation remains secret-free. No operation invents business identity or authorization.

## Evidence

Validation, schema convergence, Web deployment, LINE publication and device acceptance are distinct evidence. Artifacts record transient plans/readbacks, never migration or business authority.

Contracts: [Supabase](../platform/supabase.md), [Vercel](../platform/vercel.md), [Rich Menu](../line/rich-menu.md), [Schema](../data/schema.md), [Recovery](recovery.md).
