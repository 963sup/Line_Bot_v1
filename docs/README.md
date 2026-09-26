# 文件入口

本目錄以 Agent 的最短決策路徑組織，不按 source tree 重複知識。

1. 已知任務：先讀 [Change routing](000-core/040-change-routing.md)。
2. 已知 business owner：直接讀 [Domain owners](010-domain-owners/README.md) 與對應 owner 文件。
3. 跨 owner、Source of Truth、Boundary 或 dependency 問題：讀 [Repository map](000-core/030-repository-map.md)。
4. Business semantic / Bounded Context 問題：讀 [Domain map](000-core/020-domain-map.md)；需要外部 GitHub-like evidence 時，再從 [Architecture](../architecture/README.md) 進 machine benchmark 與 pinned upstream source。
5. implementation/provider/data/security mechanism 只有受影響時才讀 `020–070`。
6. decision、proposal、migration、gap、risk 或具日期 evidence 才讀 [Governance](090-governance/README.md)。

`000-core/` 只保留五個 decision interface：System、Domain Map、Repository Map、Change Routing、Glossary。Current truth 與 target/history 分離；README 與 AGENTS 不建立第二套產品或架構 authority。
