# Core

Core 是 repository 的 compact decision interface。一般修改先讀 [Change routing](040-change-routing.md)，再讀 1 個 Domain Owner；只有跨 owner、概念歧義或 architecture design 時才補讀其他 Core 文件。

- [System](010-system.md)：產品、runtime、跨系統不變量。
- [Domain map](020-domain-map.md)：current Business Reality / Domain / responsibility map。
- [Repository map](030-repository-map.md)：current Context relationships、Boundary mapping、Source of Truth。
- [Change routing](040-change-routing.md)：Change → owner → implementation → local rules。
- [Glossary](050-glossary.md)：Ubiquitous Language 的 cross-context canonical lookup，只收容易混淆的詞。
- [Product experience](060-product-experience.md)：跨 Domain 的 current UX semantics；非一般修改預設必讀。
- [Strategic design](070-strategic-design/README.md)：完整 Strategic DDD concept / decision rules；只有做 boundary、ownership、integration 或新 Domain modeling 時深入。
- [GitHub GraphQL FPT benchmark](080-github-graphql-fpt-benchmark.md)：GitHub-like naming、owner、locator、relationship、viewer/current-actor semantic 的 49-file external reference index；做 GitHub 對照時先由此定位 upstream fragment。
- [General management semantic graph](../../architecture/semantic-benchmark.json)：由 pinned GitHub FPT 蒸餾 governance/access relationship、Invitation intent、role/permission edge attributes、Profile/Follow/Repository views、Contribution facts、Work collaboration、Reaction、Project-owned planning metadata；僅以 pinned canonical GitHub Docs 補充 FPT 未公開的 documented derived result（目前為 Achievement）。它不是 Line_Bot_v1 product truth。

Strategic DDD 與 implementation 的主鏈：

~~~text
Business Reality
↓
Problem Space
↓
Domain
↓
Subdomain
↓
Bounded Context
↓
Ubiquitous Language / Glossary
↓
Responsibility / Ownership
↓
Context Map / Integration
↓
Business Invariants / Policy
↓
Consistency Boundary
↓
Module / Data / Public Contract
↓
Hexagonal Architecture
~~~

一般 hot path 應維持在 2–4 份文件：routing → owner → 0–2 個 cross-cutting concern → nearest AGENTS。完整 chain 只在 architecture / domain decision 需要時展開。
