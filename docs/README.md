# Knowledge task router

先判斷「現在要完成什麼」，再載入最小 knowledge unit。不要先讀完整 docs tree。

| Task | First load | Add only when needed |
| --- | --- | --- |
| 修 bug | [bug-fix](tasks/bug-fix.md) + affected owner | affected rule / reference |
| 修改 API / route | [api-change](tasks/api-change.md) + affected owner | [runtime entrypoints](rules/runtime-entrypoints.md)、authorization |
| 新增 feature | [feature-change](tasks/feature-change.md) | owner contract + affected cross-cutting rule |
| 修改 database | [database-change](tasks/database-change.md) + owner | [database writes](rules/database-writes.md) |
| Authentication / authorization | [auth-change](tasks/auth-change.md) + owner | [request authorization](rules/request-authorization.md) |
| Debug deployment / remote state | [deployment-debug](tasks/deployment-debug.md) | provider / release / recovery reference |
| Architecture / boundary change | [architecture-change](tasks/architecture-change.md) | [dependency boundaries](rules/dependency-boundaries.md) + decision |
| 找 business rule | [business-rule](tasks/business-rule.md) + owner | owner reference only for the relevant flow |

## Progressive disclosure

```text
Level 0  task router
   ↓
Level 1  one owner contract + one relevant rule
   ↓
Level 2  task/reference detail only when the decision needs it
   ↓
Level 3  proposal / migration / dated evidence / history only for change-over-time questions
```

Current machine facts先查 [sources of truth](facts/sources-of-truth.md)。跨 Context vocabulary查 [glossary](facts/glossary.md)。系統目的查 [system](facts/system.md)。

Detailed architecture/platform/data/security/engineering/operations docs 是 reference，不是預設上下文。Governance資料只在問題明確涉及 target、migration、gap、risk、acceptance evidence 時載入。
