# Core

Core 是 repository 的 compact decision interface。一般修改應維持：

```text
Task
↓
040-change-routing.md
↓
1 個 owner / concern 文件
↓
0–2 個必要 cross-cutting 文件
↓
nearest AGENTS.md
↓
Code / Schema / Manifest
↓
Validation
```

- [System](010-system.md)：產品、runtime 與跨系統 mother invariants。
- [Domain map](020-domain-map.md)：current business reality、semantic boundary 與 responsibility。
- [Repository map](030-repository-map.md)：current relationship、boundary mapping 與 Source of Truth routing。
- [Change routing](040-change-routing.md)：Change → owner → implementation → local rules。
- [Glossary](050-glossary.md)：只收跨 Context 容易歧義的 canonical vocabulary。

外部 GitHub benchmark、implementation/data topology 與可讀 projections 從 [Architecture](../../architecture/README.md) 進入；它們不在 Core 手抄第二份 truth。
