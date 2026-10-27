# Add or change a feature

## Load

1. 若功能使用 GitHub-derived semantics，先直接讀對應 `architecture/fpt/*.json` symbol/field；FPT 是 domain truth。
2. 讀 affected owner contract、package exports 與 consumers。
3. 只載入真正受影響的 rule。
4. 若沒有 owner，再讀 [architecture change](architecture-change.md)。
5. Next.js／UI 任務使用 [Next.js and shadcn agent workflow](../reference/engineering/development-workflow.md#nextjs-and-shadcn-agent-workflow)。

## Decide

先依 [mandatory package resolution](../../packages/AGENTS.md#mandatory-package-resolution) 的共用決策路徑完成 Owner、模型邊界與既有 package 承接判斷。

先定義可觀察 business result、hard invariants與真實 consumer。再判斷：

```text
existing owner can own it?
├─ yes → extend existing contract
└─ no  → prove new language/lifecycle/invariant/authority/consumer boundary
```

不要因 UI、GitHub Mobile/視覺 benchmark、folder symmetry或未來可能需求建立新 package/abstraction；同時不得因能力尚未實作而改寫或忽略 FPT domain truth。

## Minimum delivery

只交付能形成真實 end-to-end result 的最小 slice：owner rule → application contract → adapter/data if needed → delivery → validation。未完成能力明示 unavailable，不用 fake state。
