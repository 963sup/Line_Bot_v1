# Knowledge task router

依 [Effective context contract](../AGENTS.md#effective-context-contract) 保留完整 authority/invariants，再按任務載入必要來源。下表只路由，不建立第二套讀取或治理規則。

| Task | First load | Add only when needed |
| --- | --- | --- |
| Fix a bug | [bug fix](tasks/bug-fix.md) + [affected owner](owners/README.md) | one affected rule / reference |
| Change API / route | [API change](tasks/api-change.md) + owner | [runtime entrypoints](rules/runtime-entrypoints.md), authorization if protected |
| Add / change feature | [feature change](tasks/feature-change.md) | owner + affected cross-cutting rule |
| Change database | [database change](tasks/database-change.md) + owner | [database writes](rules/database-writes.md) |
| Authentication / authorization | [auth change](tasks/auth-change.md) + owner | [request authorization](rules/request-authorization.md) |
| Debug deployment / remote state | [deployment debug](tasks/deployment-debug.md) | one provider / release / recovery reference |
| Architecture / ownership | [architecture change](tasks/architecture-change.md) | [dependency boundaries](rules/dependency-boundaries.md) + decision only if why is needed |
| Codex / MCP usage | [development workflow](reference/engineering/development-workflow.md) | [local environment](reference/engineering/local-environment.md) |
| Find / change business rule | [business rule](tasks/business-rule.md) + owner | owner-specific reference only for the relevant flow |

## Progressive disclosure

```text
Task
→ one owner contract
→ one cross-cutting rule when needed
→ exact reference detail only when the decision needs it
→ current owner/source only; use provider or CI evidence for verification
```

Quick routing: [owners](owners/README.md) · [system facts](facts/system.md) · [sources of truth](facts/sources-of-truth.md) · [glossary](facts/glossary.md) · [reference](reference/README.md).

Do not preload `reference/`. Machine current facts remain authoritative in `architecture/*.json`, source/tests, package exports and `packages/integration-supabase/src/schemas/`.

## Canonical ownership rule

`docs/` is a router and cross-system knowledge layer. Provider-specific content belongs to the owning integration package; business rules belong to the owner package; `docs/reference` keeps only cross-package semantics and indexes. Use the package README and nearest `AGENTS.md` as the first implementation source, then follow a linked reference only when the owner contract requires it.
