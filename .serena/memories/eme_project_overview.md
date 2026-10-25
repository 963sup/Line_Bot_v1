# EME Project Overview

- ESM TypeScript pnpm monorepo: `apps/web` is the executable Next.js application; `packages/*` own bounded business capabilities.
- Business and technical decisions are owner-first: identify Owner, capability, contract, and actual consumer before changing source.
- Human task router: `docs/README.md`. Machine architecture truth: `architecture/`.
- Main persistence/schema source: `supabase/schemas/`; SQL and RLS are authoritative there, not in prose.
- Use `mem:eme_architecture_authority` for the truth hierarchy and `mem:eme_architecture_ownership` for edit boundaries.
