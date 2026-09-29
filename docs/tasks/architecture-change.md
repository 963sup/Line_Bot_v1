# Change architecture or ownership

## Load

- [sources of truth](../facts/sources-of-truth.md)
- [dependency boundaries](../rules/dependency-boundaries.md)
- affected owner contract
- existing decision只在需要理解 why 時讀

## Decision sequence

```text
business result
→ hard invariants
→ consumer need
→ current owner
→ source of truth
→ semantic / module / data / consistency boundary
→ dependency direction
→ correct change
→ validation
```

Bounded Context ≠ Module Boundary ≠ Data Boundary ≠ Consistency Boundary。

新增 package/interface/event/cache/worker前要求真實 responsibility evidence；若修法需要多個 alias/wrapper/exception，重新檢查 root cause/owner。

GitHub-derived concept / field / query / mutation 先直接解析 `architecture/domain/fpt/*.json` 的 exact file / symbol / field；FPT 是 domain truth，不需要先有 local consumer 或 implementation 才成立。Semantic ownership / Line_Bot_v1 extension 改 `semantic-model.json`；module/dependency改 `implementation-topology.json`；data ownership改 `data-topology.json`。
