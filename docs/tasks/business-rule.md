# Find or change a business rule

## Load

1. 找 semantic owner：`pnpm semantic explain <concept>` 或 `architecture/semantic-model.json`。
2. 讀該 owner contract。
3. 只有 owner contract明確指向某 flow/locator/protocol reference時才下鑽。

不要先讀 platform/architecture總論。

## Authority order

```text
code / schema / tests
→ owner contract
→ selected decision（why）
→ proposal / migration（future only）
→ historical evidence
```

若 docs與implementation衝突，先判斷 docs stale還是 code違反已選 contract；不要自動「以文件為準」或「以程式為準」。

修改 rule時同步最小 executable enforcement/test；current rule不應只存在 prose。
