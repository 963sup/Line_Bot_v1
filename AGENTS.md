# Repository change contract

任何修改先以 repository evidence 確認 current state；不要用一般 best practice、舊文件或猜測取代 code / manifest / schema / tests。

## Global invariants

- 先定義可觀察 business result，再沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth 找根因。
- 維持 [system invariants](docs/rules/system-invariants.md)：authority、authorization/isolation、concurrency/replay、atomicity/recovery、ownership/dependency、evidence integrity。
- 跨 package 只用 public exports；不用 alias、wrapper、facade 或 compatibility layer 掩蓋錯誤 ownership。
- 沒有真實 consumer、variation、technology/policy boundary、transaction/recovery 或 isolation responsibility，不新增 abstraction。
- 不提交 secret、private credential、personal data；remote mutation 需要既有 authorization、exact target 與 readback。
- Static、test、build、schema、deployment、provider/API、device evidence 分開回報；未知明示。

## Retrieval

先從 [task router](docs/README.md) 取得最小上下文；已知 owner 時直接讀 owner contract與 nearest `AGENTS.md`。跨 owner或語意變更可用：

```sh
pnpm semantic plan "<intent>"
pnpm semantic context "<intent>"
```

Source-of-truth routing 見 [facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。子 AGENTS 只增加 local constraints，不能放寬本檔。

## Change and validation

- 保留既有／他人修改；同 checkout 不並行寫同一檔案或產物。
- 可逆且由現有 contract決定的實作直接完成；只有缺少會改變產品語意、資料處置或外部寫入授權的資訊才阻塞。
- JS/TS/JSON formatting 由 Biome；修改後可用 `pnpm format`，validation 維持 read-only。
- 一般修改：`pnpm check`。文件：`pnpm docs:check`。Merge/release：`pnpm validate`。精確 evidence boundary 見 [validation rules](docs/rules/validation-evidence.md)。
- Merge 前依 [development workflow](docs/060-engineering/020-development-workflow.md) 收斂 WIP/fixup history。

Scope instructions：[`packages/`](packages/AGENTS.md) · [`scripts/`](scripts/AGENTS.md) · [`.github/`](.github/AGENTS.md) · [`.agents/`](.agents/AGENTS.md) · [`.codex/`](.codex/AGENTS.md)。
