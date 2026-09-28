# Knowledge task router

Choose the task first, then load the smallest sufficient knowledge unit.

| Task | First load | Add only when needed |
| --- | --- | --- |
| Fix a bug | [bug fix](tasks/bug-fix.md) + [affected owner](owners/README.md) | one affected rule / reference |
| Change API / route | [API change](tasks/api-change.md) + owner | [runtime entrypoints](rules/runtime-entrypoints.md), authorization if protected |
| Add / change feature | [feature change](tasks/feature-change.md) | owner + affected cross-cutting rule |
| Change database | [database change](tasks/database-change.md) + owner | [database writes](rules/database-writes.md) |
| Authentication / authorization | [auth change](tasks/auth-change.md) + owner | [request authorization](rules/request-authorization.md) |
| Debug deployment / remote state | [deployment debug](tasks/deployment-debug.md) | one provider / release / recovery reference |
| Architecture / ownership | [architecture change](tasks/architecture-change.md) | [dependency boundaries](rules/dependency-boundaries.md) + decision only if why is needed |
| Find / change business rule | [business rule](tasks/business-rule.md) + owner | owner-specific reference only for the relevant flow |

## Progressive disclosure

```text
Task
→ one owner contract
→ one cross-cutting rule when needed
→ exact reference detail only when the decision needs it
→ change/history evidence only for change-over-time questions
```

Quick routing: [owners](owners/README.md) · [system facts](facts/system.md) · [sources of truth](facts/sources-of-truth.md) · [glossary](facts/glossary.md) · [reference](reference/README.md) · [change/history](change/README.md).

Do not preload `reference/` or `change/`. Machine current facts remain authoritative in `architecture/*.json`, source/tests, package exports and `supabase/schemas/`.
