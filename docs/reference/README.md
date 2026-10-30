# Reference router

Cold-path detail. Do not preload for ordinary tasks.

- Domain lifecycle / command / locator detail → `reference/domains/`
- Architecture mechanics / trade-offs → `reference/architecture/`
- LINE provider detail → `reference/line/`
- Platform/provider detail → `reference/platform/`
- Data / persistence detail → `reference/data/`
- Authentication / permission / isolation / secret detail → `reference/security/`
- Engineering / tooling detail → `reference/engineering/`
- Release / recovery / observability detail → `reference/operations/`
- Current route inventory → [runtime routes](runtime/routes.md)

Current owner contracts are under [owners](../owners/README.md). Unresolved work belongs to the owning package, issue or PR; this directory does not maintain a historical change archive.

Provider details are indexed here but owned by packages: [Supabase](platform/README.md#supabase), [OpenAI / AI](platform/README.md#ai), [Vercel](platform/README.md#vercel), [Google Workspace](platform/README.md#google-workspace), [Redis](platform/README.md#redis), and [LINE](line/). Follow the linked package README before reading cold-path detail.
