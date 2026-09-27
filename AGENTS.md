# Repository change contract

以 repository evidence 確認 current state；不要用 best practice、舊文件或猜測取代 code / manifest / schema / tests。

## Invariants

- 先定義 business result，再沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth 找根因。
- 保持 [system invariants](docs/rules/system-invariants.md)：authority、authorization/isolation、concurrency/replay、atomicity/recovery、ownership/dependency、evidence integrity。
- 跨 package 只用 public exports；不用 alias/wrapper/facade/compatibility layer 掩蓋 ownership。
- 無真實 consumer、variation、technology/policy boundary、transaction/recovery 或 isolation responsibility，不新增 abstraction。
- 不提交 secret、credential、personal data；remote mutation 要有 authorization、exact target、readback。
- 不同 evidence 分開回報；未知明示。

## Retrieval

先用 [task router](docs/README.md) 取最小 context；已知 owner 時直接讀 owner contract + nearest `AGENTS.md`。跨 owner/語意變更可用 `pnpm semantic plan "<intent>"` / `pnpm semantic context "<intent>"`。

Markdown / instruction / `AGENTS.md` 收斂或 agent-context optimization：修改前必須載入 [context-convergence](.agents/skills/context-convergence/SKILL.md)。

Source-of-truth：[facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。子 AGENTS 只增加 local constraints。

## Change / validation

- 保留既有/他人修改；同 checkout 不並行寫同一檔案或產物。
- 可逆且 contract 已決定的實作直接完成；只有缺少會改變產品語意、資料處置或外部寫入授權的資訊才阻塞。
- JS/TS/JSON 由 Biome formatting；需要時用 `pnpm format`。
- 一般修改 `pnpm check`；文件 `pnpm docs:check`；merge/release `pnpm validate`。Evidence boundary：[validation rules](docs/rules/validation-evidence.md)。
- Merge 前依 [development workflow](docs/reference/engineering/development-workflow.md) 收斂 WIP/fixup history。

Scopes：[`packages/`](packages/AGENTS.md) · [`scripts/`](scripts/AGENTS.md) · [`.github/`](.github/AGENTS.md) · [`.agents/`](.agents/AGENTS.md) · [`.codex/`](.codex/AGENTS.md)。
