# Repository change contract

以 repository evidence 確認 current state；不要用 best practice、舊文件或猜測取代 code / manifest / schema / tests。

## Mandatory governing set

任何 repository analysis、design、implementation、refactor、debug、CI fix 前，必須先讀取 target ref 的 current version 並遵守：

- `architecture/README.md`
- `architecture/data-topology.json`
- `architecture/implementation-topology.json`
- `architecture/semantic-benchmark.json`
- `architecture/semantic-model.json`
- `.dependency-cruiser.mjs`
- `biome.json`
- `knip.jsonc`

這些檔案是 architecture / topology / benchmark / dependency / formatting / reachability 的 governing inputs，不是為了讓 local implementation 或 CI 通過而可任意調整的 escape hatch。

- 一般 feature、refactor、bug fix、CI fix：修 source、ownership、dependency、public export、placement 或真正 root cause；不得透過弱化 governing file、加 ignore、exception、alias、wrapper 或 compatibility surface 消除 violation。
- 若任務本身就是修改 governing file，先證明 authority / contract 為何真的需要改，再同步所有受影響 consumer、guard、tests、docs 與 validation evidence；不得從 symptom 反推規則應放寬。
- `architecture/semantic-benchmark.json` 只提供 pinned external benchmark evidence；不得取代 `architecture/semantic-model.json` 的 product authority。
- Nested `AGENTS.md` 只能增加 local constraint，不能削弱或覆寫本 governing set。

## Invariants

- 先定義 business result，再沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth 找根因。
- 保持 [system invariants](docs/rules/system-invariants.md)：authority、authorization/isolation、concurrency/replay、atomicity/recovery、ownership/dependency、evidence integrity。
- 跨 package 只用 public exports；不用 alias/wrapper/facade/compatibility layer 掩蓋 ownership。
- 無真實 consumer、variation、technology/policy boundary、transaction/recovery 或 isolation responsibility，不新增 abstraction。
- 不提交 secret、credential、personal data；remote mutation 要有 authorization、exact target、readback。
- 不同 evidence 分開回報；未知明示。

## Retrieval

先用 [task router](docs/README.md) 取最小 context；已知 owner 時直接讀 owner contract + nearest `AGENTS.md`。跨 owner/語意變更可用 `pnpm semantic plan "<intent>"` / `pnpm semantic context "<intent>"`。

修改指引前先核對實際 consumer；任務入口放 `.github/prompts/`、Codex 角色放 `.codex/agents/`，不維護重複 skill 或 Markdown review database。

Source-of-truth：[facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。子 AGENTS 只增加 local constraints。

## Change / validation

- 保留既有/他人修改；同 checkout 不並行寫同一檔案或產物。
- 可逆且 contract 已決定的實作直接完成；只有缺少會改變產品語意、資料處置或外部寫入授權的資訊才阻塞。
- JS/TS/JSON 由 Biome formatting；需要時用 `pnpm format`。
- 一般修改 `pnpm check`；文件 `pnpm docs:check`；merge/release `pnpm validate`。Evidence boundary：[validation rules](docs/rules/validation-evidence.md)。
- Merge 前依 [development workflow](docs/reference/engineering/development-workflow.md) 收斂 WIP/fixup history。

Scopes：[`packages/`](packages/AGENTS.md) · [`scripts/`](scripts/AGENTS.md) · [`.github/`](.github/AGENTS.md) · [`.agents/`](.agents/AGENTS.md) · [`.codex/`](.codex/AGENTS.md)。
