# Change architecture or ownership

## Load

- [sources of truth](../facts/sources-of-truth.md)
- [dependency boundaries](../rules/dependency-boundaries.md)
- affected owner contract
- existing decision只在需要理解 why 時讀

## Decision sequence

先依 [mandatory package resolution](../../packages/AGENTS.md#mandatory-package-resolution) 的共用決策路徑確認 business result、invariants、子域／模型邊界、Owner、既有 package 承接能力、Aggregate／用例與 public/data/dependency contract，再提出最小必要變更。

Bounded Context ≠ Module Boundary ≠ Data Boundary ≠ Consistency Boundary。

新增 package/interface/event/cache/worker前要求真實 responsibility evidence；若修法需要多個 alias/wrapper/exception，重新檢查 root cause/owner。

GitHub-derived concept / field / query / mutation 先直接解析 `architecture/fpt/*.json` 的 exact file / symbol / field；FPT 是 domain truth，不需要先有 local consumer 或 implementation 才成立。Semantic ownership / Line_Bot_v1 extension 改 `registry.json#domain`；module/dependency改 `registry.json#modules`；data ownership改 `registry.json#data`。
