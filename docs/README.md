# 文件入口

本目錄以 Agent 的「最短理解路徑」為主，而不是按實作資料夾複製知識。

1. 已知任務：先讀 [Change routing](000-core/040-change-routing.md)。
2. 要做 Strategic DDD / boundary 設計：讀 [Strategic design](000-core/070-strategic-design/README.md)；若要求 GitHub-like 對照，再讀 [GitHub GraphQL FPT benchmark](000-core/080-github-graphql-fpt-benchmark.md)，先定位 upstream schema fragment再下結論；一般修改不需預讀全套。
3. 已知 business owner：直接讀 [Domain owners](010-domain-owners/README.md)。
4. 需要跨 owner 關係／邊界／SSOT：讀 [Repository map](000-core/030-repository-map.md)。
5. 需要 implementation / provider / data / security mechanism 時，再進入對應責任區。
6. 只有要理解 decision、proposal、migration、gap、risk、evidence 或 history 時才讀 [Governance](090-governance/README.md)。

Canonical current knowledge 位於 `000-core/` 至 `070-operations/`；`090-governance/` 保存 change-over-time knowledge。Business meaning、code、schema、manifest、runtime evidence 各有不同 authority，不以文件覆寫 machine truth。

Strategic concept definition 與 decision rules 由 `000-core/070-strategic-design/` 擁有；實際 current owner / relationship / mapping 仍回 Domain Map、Repository Map、Domain Owner 與 machine truth。

三個邊界不可混同：Bounded Context 是模型與語言邊界；Module Boundary 是 source/public surface 邊界；Data Boundary 是 persisted facts、存取與隔離邊界。
