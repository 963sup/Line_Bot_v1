# Validation

Repository validation 使用既有 scripts 作單一入口；不要把 typecheck、test、build、deployment、API probe 或手機驗收混成同一種證據。

## Main commands

| Command | Responsibility |
| --- | --- |
| `docs:check` | Markdown、canonical docs 檔名與 local file links 的機械檢查；不驗 remote URL、runtime behavior 或手機 |\n| `schema:check` | `@line-work/platform` 執行 declarative schema source tests 與 PGlite clean-build / runtime-role / RLS contract tests；不代表 remote catalog 一致 |
| `lint` | `biome check .` 的 read-only static gate；驗 formatter、lint 與 assist/import ordering，不修改檔案 |\n| `format` | `biome check --write .` 的 canonical local mutation；一次套用 formatter、safe lint fixes 與 assist/import ordering，之後再跑 read-only validation |
| `architecture` / `architecture:test` | dependency graph、runtime boundary、合法/違規反例 |
| `deadcode` | `knip` 的 repository reachability gate；檢查 dead file、unused export／dependency。finding 必須回到 owner／consumer／entry point 判讀，禁止用 broad `ignore` 消音 |
| `typecheck` | TypeScript contract |
| `test` | 適用 unit/integration/runtime tests |
| `build` | production build / framework compile |
| `tooling:check` | scripts、AGENTS hierarchy、skills、TOML、tooling metadata 與 GitHub workflow least-privilege / publication-order guard |
| `tooling:rules` | 需要既有 `CODEX_CLI` 的 Codex execpolicy semantic check；不納入一般 offline CI，也不執行被描述的業務操作 |
| `check` | 日常 fast feedback，含 lint、architecture 與 affected type/test |
| `validate` | merge/release 前完整 tooling/docs/lint/architecture/deadcode/type/test/build |

實際順序由 `scripts/tooling/validate.mjs` 與 package scripts 擁有；文件不複製 implementation 細節作 second source。VS Code workspace 使用 `.vscode/settings.json` 在 save 時套用同一 Biome formatter / organize imports；Agent／CLI 產出使用 `pnpm format`，CI 仍只做 read-only `pnpm lint`。

Biome 同時涵蓋 `knip.jsonc` 與 `architecture/**/*.json`，React Hooks 的呼叫位置與 effect dependencies 也納入 correctness gate。Knip 對 private workspace package 的 entry exports 檢查實際 repository consumer；未使用 export 應先區分內部宣告、必要公開契約與真正死碼，再收斂 public surface。

## Fast vs full validation

`check` 先依 Git 變更責任分流：純 Markdown 只跑 `docs:check`，所有 `AGENTS.md` 視為 tooling metadata 並額外跑 `tooling:check`，純 declarative schema 只跑 `schema:check`；產品／runtime source 進 Biome lint、architecture、Knip deadcode 與 Turbo affected type/test。Knip config／editor tooling 變更也會觸發對應 tooling/deadcode gate。無法可靠判斷範圍時保守退回完整 fast gates。root config / shared dependency 改動可擴張到整個 workspace；手動 filter 必須涵蓋所有 consumer，不以縮小 filter 隱藏跨 package failure。

GitHub Draft pull request 代表 active iteration，validation job 必須 skip，避免每次 checkpoint push 都配置 hosted runner；`ready_for_review` 與 Ready PR 的後續更新才執行 `pnpm check`。checkout 保留完整 Git history 供 Turbo 判斷 changed packages 與 transitive consumers；不在 workflow 手工維護 package path matrix。push 到 `main` 才執行完整 `pnpm validate`。

`validate` 是完整 repository gate，不代表 deploy、migration、LINE API、Supabase remote project 或真機驗收已完成。PR affected check 與 main full validate 是不同證據，不以其中一者冒充另一者。

Full `validate` 擁有 read-only Supabase remote tooling tests。External release 是另一層 evidence：`Release` 由 successful same-repository `main` `Validate` 的 `workflow_run` completion 觸發，不重新跑 repository validation。Affected-source routing 以前次 completed Release 中成功的 `gate` job 作 cursor，不以整體 Release conclusion 取代 routing truth；Supabase 對每個 validated main revision 仍執行 changed automatic sync 或 unchanged verify，只有 remote convergence 成功後才允許 Production deployment。`sync` 對 validated declarative SQL change一律執行完整 remote diff；`routine / sensitive` classification只作診斷，不作 approval gate。真正 acceptance 是 exact target、transaction apply、second diff = 0、ownership/security readback與 migration-history fingerprint unchanged。需要 explicit business metadata或 data-cutover recovery authorization時才使用 `prepare-plan → reviewed plan SHA-256 → apply`。Automatic 與 manual GitHub jobs 共用 production database concurrency key，repository-owned remote mutation另有 PostgreSQL advisory lock。

## Concurrency

Type generation、test/build artifact 與 dependency install 在同一 checkout 可能競爭。驗證流程預設按 repository runner 順序執行；不要同時手動跑另一套會寫相同產物的 command。

## External-effect tools

以下可能需要明確環境／授權，不屬一般 offline validate：

- LINE / Supabase connection probes
- Redis probe（會建立/刪除 synthetic key）
- AI / receipt real provider probe（可能消耗 quota）
- Webhook set / restore
- Rich Menu publish / activate
- schema migration / import / runtime-role setup
- deployment / production API checks

格式驗證、HTTP 200 或 provider 接受 request 都不等於使用者收到結果。

## Evidence

具日期的驗證結果應保存於 `090-governance/060-acceptance/`，內容標明版本、環境、範圍、結果與未驗證項。工程規範只描述如何驗，不保存歷次結果。
