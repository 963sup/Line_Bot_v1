# Explore package

Routing and module overview for `@line_bot_v1/explore`.

- Semantic Owner: `repository`
- Authority document: [`docs/owners/repository.md`](../../docs/owners/repository.md)
- Machine boundaries: [`architecture/registry.json#modules`](../../architecture/registry.json#modules)
- Persistence mapping: [`architecture/registry.json#data`](../../architecture/registry.json#data)

## Scope

Application-level projection for repository discovery, trending activity, and awesome/curated lists.

Query orchestration: `src/application/queries/repository-discovery.ts`. Repository supplies the public discovery read contract and PostgreSQL capability; source facts and access remain Repository-owned.
